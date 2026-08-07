/**
 * The one place that talks to the archives.
 *
 * It asks them all at once and merges what comes back, so a question is
 * answered by whichever of them holds something. It imports nothing from the
 * MCP layer and is published on its own, so the same code serves a plain
 * script.
 *
 * The merge is additive. Archives asked for a phrase are asked about different
 * bodies of material, so what comes back is one list of where that phrase was
 * printed rather than several answers to the same question. Nothing is
 * ranked across them, no count is added to another, and no order is imposed
 * that would need a quantity they share.
 *
 * An archive that fails is reported as an archive that failed, with the moment
 * that failed. It is never folded into the answer as an absence: "the Library
 * of Congress was unreachable" and "the Library of Congress holds no such
 * page" are different statements about the world, and a caller that cannot tell
 * them apart will make the second one.
 */

import type { Config, Logger } from "../config.js";
import {
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../config.js";
import { BooksError, invalidInput, timeout as timedOut, toBooksError } from "../errors.js";
import type {
  Capability,
  Hit,
  ItemDetail,
  ItemRow,
  MergedHits,
  MergedItems,
  SourceId,
  SourceProfile,
  SourceReport,
} from "../types.js";
import type { CatalogueQuery, SortKey, SourceAdapter } from "./adapter.js";
import { resolveId } from "./ids.js";
import type { ResolvedId } from "./ids.js";
import { buildSources, pacingFor, selectSources, splitByCapability } from "./registry.js";
import type { Absence, Readers } from "./registry.js";

export type {
  Capability,
  ExcerptKind,
  Hit,
  ItemDetail,
  ItemRow,
  MergedHits,
  MergedItems,
  Rights,
  SourceId,
  SourceProfile,
  SourceReport,
} from "../types.js";
export type {
  CatalogueQuery,
  Claim,
  InsideQuery,
  ReadDetail,
  ReadRows,
  SortKey,
  SourceAdapter,
} from "./adapter.js";
export type { ArchiveReader } from "./archive.js";
export type { LocReader } from "./loc.js";
export type { Absence, Readers } from "./registry.js";
export { CAPABILITIES } from "../types.js";
export { SORT_KEYS } from "./adapter.js";
export { MEDIA_TYPES, SOURCE_IDS, SOURCE_PROFILES, splitByCapability } from "./registry.js";
export { namespacedId, resolveId } from "./ids.js";

export interface BooksClientOptions {
  config?: Partial<Config>;
  logger?: Logger;
  /** Stands in for one or more of the archive readers. */
  readers?: Readers;
  /** Replaces the registry outright, for a program bringing its own archives. */
  sources?: SourceAdapter[];
}

/** The largest number of rows any one archive is asked for in a single call. */
export const MAX_LIMIT_PER_SOURCE = 25;

/**
 * The longest an archive's own reader waits between two attempts.
 *
 * A reader that is asked to slow down waits before trying again, and the wait
 * grows with each refusal. The backstop deadline allows for it so that patience
 * is never reported as silence.
 */
export const LONGEST_BACKOFF_MS = 30_000;

/**
 * The pacing this server owes each archive, applied to whatever it is handed.
 *
 * A configuration object assembled by a caller has not been through
 * `loadConfig`, so it can carry a missing value, a value of the wrong shape, or
 * a User-Agent that names somebody else. Every setting is held to the same
 * range the environment parser enforces: `timeoutMs: 0` is the usual way of
 * writing "no deadline", and a retry count of a hundred thousand aimed at an
 * archive paced in seconds is hours of traffic from a single call.
 */
function withGuarantees(config: Config): Config {
  const defaults = loadConfig({});

  const bounded = (value: unknown, fallback: number, min: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  const claimed = typeof config.userAgent === "string" ? config.userAgent.trim() : "";
  const identifier = defaults.userAgent;

  return {
    ...config,
    userAgent:
      claimed === "" || claimed.includes(identifier) ? identifier : `${claimed} ${identifier}`,
    // Left unset, each archive keeps the spacing its own reader was built with.
    minIntervalMs:
      config.minIntervalMs === null || config.minIntervalMs === undefined
        ? null
        : bounded(
            config.minIntervalMs,
            MIN_ALLOWED_INTERVAL_MS,
            MIN_ALLOWED_INTERVAL_MS,
            MAX_ALLOWED_INTERVAL_MS,
          ),
    timeoutMs: bounded(config.timeoutMs, defaults.timeoutMs, 1000, 120_000),
    maxRetries: bounded(config.maxRetries, defaults.maxRetries, 0, 8),
    cacheTtlMs: bounded(config.cacheTtlMs, defaults.cacheTtlMs, 0, 86_400_000),
    cacheMaxEntries: bounded(config.cacheMaxEntries, defaults.cacheMaxEntries, 1, 5000),
    logLevel: config.logLevel ?? defaults.logLevel,
  };
}

/**
 * A wall clock over one archive, as a backstop under the deadline that
 * archive's own reader keeps.
 *
 * That reader times out its own requests, so this only matters when it cannot:
 * a socket that stalls without erroring, a stand-in reader, a bug a compatible
 * version of a dependency can introduce. Without it, one archive that never
 * answers holds the whole call open and the rows the others had ready are never
 * returned.
 *
 * The alarm abandons the request; it does not stop it. A request already sent
 * runs to the reader's own deadline and its answer is discarded, so the pacing
 * this server owes the archive is kept either way.
 */
function withDeadline<T>(work: Promise<T>, ms: number, source: SourceProfile): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const alarm = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          timedOut(`${source.name} did not answer within ${ms}ms and was left out of this answer.`),
        ),
      ms,
    );
    // A pending timer must not hold the process open once the answer is out.
    timer.unref?.();
  });
  return Promise.race([work, alarm]).finally(() => clearTimeout(timer));
}

/** What one archive produced for one question, whether or not it produced anything. */
interface Attempt<T> {
  source: SourceAdapter;
  rows: T[];
  cached: boolean;
  reportedTotal: number | null;
  reportedTotalMeans: string | null;
  orderedOn: string | null;
  mediaTypeAsked: string | null;
  skipped: number | null;
  error: { code: string; message: string; hint?: string } | null;
}

/**
 * Whether an archive says it holds more than the page just read.
 *
 * The total counts across every page and the row count counts this page, so the
 * rows already passed have to be added back before the two can be compared.
 * Comparing them directly tells a caller on the last page to fetch the next one.
 */
function moreBeyond(
  reportedTotal: number | null,
  page: number,
  limit: number,
  count: number,
): boolean | null {
  if (reportedTotal === null) return null;
  return reportedTotal > (page - 1) * limit + count;
}

function reportOf<T>(
  attempt: Attempt<T>,
  count: number,
  page: number,
  limit: number,
): SourceReport {
  return {
    source: attempt.source.id,
    name: attempt.source.name,
    status: attempt.error ? "failed" : "answered",
    stage: "search",
    absentBecause: null,
    count,
    reportedTotal: attempt.reportedTotal,
    reportedTotalMeans: attempt.reportedTotalMeans,
    skipped: attempt.skipped,
    orderedOn: attempt.orderedOn,
    mediaTypeAsked: attempt.mediaTypeAsked,
    moreOnThisArchive: attempt.error ? null : moreBeyond(attempt.reportedTotal, page, limit, count),
    cached: attempt.cached,
    error: attempt.error,
  };
}

/** An archive that was not asked, reported so the answer can name it. */
function absentReport(absence: Absence): SourceReport {
  return {
    source: absence.source.id,
    name: absence.source.name,
    status: "absent",
    stage: null,
    absentBecause: absence.because,
    count: 0,
    reportedTotal: null,
    reportedTotalMeans: null,
    skipped: 0,
    orderedOn: null,
    mediaTypeAsked: null,
    moreOnThisArchive: null,
    cached: false,
    error: null,
  };
}

/**
 * Interleave rows so no archive opens the list twice before another has opened
 * it once.
 *
 * Ranking them against each other would need a score every archive carries, and
 * there is none: relevance is computed differently on each, and a year measures
 * the date of an edition in one place and the date on a catalogue record in
 * another. Taking one from each in turn is an order a caller can describe
 * exactly, which is what the answer does.
 */
export function interleave<T>(groups: T[][]): T[] {
  const merged: T[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const row = group[index];
      if (row !== undefined) merged.push(row);
    }
  }
  return merged;
}

/** What one archive was asked to look under, or why it was not asked at all. */
interface MediaTypeChoice {
  asked: Map<SourceId, string | null>;
  absent: Absence[];
}

/**
 * Settle what each archive is asked to look under.
 *
 * The archives file kinds of material under different names, and `texts` and
 * `books` are not the same set. Translating one into the other would narrow or
 * widen a search without saying so, so a name an archive does not use means
 * that archive is not asked and is named as absent, with its own names offered.
 *
 * A caller naming nothing gets each archive's own default, which for an archive
 * keeping one catalogue per kind of material is a real narrowing and is
 * reported as one.
 */
export function chooseMediaTypes(
  sources: readonly SourceAdapter[],
  wanted: string | undefined,
): MediaTypeChoice {
  const asked = new Map<SourceId, string | null>();
  const absent: Absence[] = [];

  for (const source of sources) {
    if (wanted === undefined) {
      asked.set(source.id, source.defaultMediaType);
      continue;
    }
    if (source.mediaTypes.includes(wanted)) {
      asked.set(source.id, wanted);
      continue;
    }
    absent.push({
      source,
      because:
        `${source.name} files no kind of material under "${wanted}". It was not asked, because ` +
        `translating that name into one of its own would search a different set of things than ` +
        `the one requested. Its own names are: ${source.mediaTypes.join(", ")}.`,
    });
  }

  return { asked, absent };
}

export class BooksClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly sources: SourceAdapter[];

  constructor(options: BooksClientOptions = {}) {
    this.config = withGuarantees({ ...loadConfig(), ...options.config });
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.sources = options.sources ?? buildSources(this.config, options.readers ?? {});
  }

  /** What every archive sees this client call itself. */
  get userAgent(): string {
    return this.config.userAgent;
  }

  get timeoutMs(): number {
    return this.config.timeoutMs;
  }

  get maxRetries(): number {
    return this.config.maxRetries;
  }

  /** The archives this server reads, in the order an answer takes them. */
  get profiles(): SourceProfile[] {
    return this.sources.map((source) => ({ ...source }));
  }

  /** The spacing each archive is left, after any setting has widened it. */
  get pacing(): Array<{ id: SourceId; name: string; intervalMs: number; because: string }> {
    return this.sources.map((source) => ({
      id: source.id,
      name: source.name,
      intervalMs: this.paceOf(source),
      because: source.paceReason,
    }));
  }

  /** The longest an answer can take to come back, over every archive at once. */
  get slowestPacingMs(): number {
    return Math.max(0, ...this.pacing.map((entry) => entry.intervalMs));
  }

  /**
   * The backstop deadline over one archive.
   *
   * It has to cover every attempt the reader is entitled to make, the pacing
   * before each of them, and the wait a reader keeps after an archive asks it
   * to slow down. Budgeting less turns an archive that is patiently backing off
   * into an archive reported as never having answered, and a caller reading
   * `timeout` where `rate_limited` was true concludes the record is missing.
   */
  private deadlineFor(source: SourceAdapter): number {
    const attempts = this.config.maxRetries + 1;
    // Pacing is kept before every attempt, including the first. A backoff only
    // happens between two of them, so there is one fewer of those.
    return (
      (this.config.timeoutMs + this.paceOf(source)) * attempts +
      LONGEST_BACKOFF_MS * this.config.maxRetries
    );
  }

  /**
   * The spacing an archive's reader is actually keeping.
   *
   * A reader supplied by a caller, or one that has widened its own spacing
   * because the archive pushed back, paces differently from the number the
   * registry started it on. Reporting the registry's number would announce a
   * promise the running client is not the one keeping.
   */
  private paceOf(source: SourceAdapter): number {
    const observed = (source as { observedPaceMs?: () => number | null }).observedPaceMs?.();
    return typeof observed === "number" && Number.isFinite(observed) && observed > 0
      ? observed
      : pacingFor(this.config, source.paceMs);
  }

  /**
   * Search the machine-read text of every archive that holds any, at once.
   *
   * The corpora are different bodies of material, so this asks where a phrase
   * was printed rather than which archive answers a question better. The calls
   * go out together, so the answer takes as long as the slowest archive rather
   * than as long as all of them.
   */
  async searchInside(
    query: string,
    options: {
      limit: number;
      page: number;
      maxExcerptChars: number;
      maxExcerptsPerMatch: number;
    },
    wanted?: readonly SourceId[],
  ): Promise<MergedHits> {
    const trimmed = query.trim();
    if (trimmed === "") {
      throw invalidInput(
        "A full-text search needs words to look for.",
        "Give words, or a phrase in double quotes such as '\"call me ishmael\"'.",
      );
    }

    const chosen = selectSources(this.sources, wanted);
    const { able, absent } = splitByCapability(chosen, "search_inside");
    const limit = boundedLimit(options.limit);

    const attempts = await Promise.all(
      able.map((source) =>
        this.attempt<Hit>(source, null, () =>
          source.searchInside!({
            query: trimmed,
            limit,
            page: Math.max(1, Math.trunc(options.page)),
            maxExcerptChars: options.maxExcerptChars,
            maxExcerptsPerMatch: options.maxExcerptsPerMatch,
          }),
        ),
      ),
    );

    const page = Math.max(1, Math.trunc(options.page));
    const groups = attempts.map((attempt) => attempt.rows.slice(0, limit));
    return {
      hits: interleave(groups),
      reports: [
        ...attempts.map((attempt, index) => reportOf(attempt, groups[index]!.length, page, limit)),
        ...absent.map(absentReport),
      ],
      asked: attempts.length,
    };
  }

  /** Search every catalogue at once, each in its own vocabulary. */
  async searchItems(
    query: string,
    options: {
      mediaType?: string;
      yearFrom?: number;
      yearTo?: number;
      sort: SortKey;
      limit: number;
      page: number;
    },
    wanted?: readonly SourceId[],
  ): Promise<MergedItems> {
    const trimmed = query.trim();
    if (trimmed === "") {
      throw invalidInput(
        "A catalogue search needs something to look for.",
        "Name a title, a creator or a subject.",
      );
    }

    const chosen = selectSources(this.sources, wanted);
    const byCapability = splitByCapability(chosen, "search_items");
    const byVocabulary = chooseMediaTypes(byCapability.able, options.mediaType);
    const limit = boundedLimit(options.limit);
    const able = byCapability.able.filter((source) => byVocabulary.asked.has(source.id));

    const attempts = await Promise.all(
      able.map((source) => {
        const mediaType = byVocabulary.asked.get(source.id) ?? null;
        const request: CatalogueQuery = {
          query: trimmed,
          mediaType,
          ...(options.yearFrom === undefined ? {} : { yearFrom: options.yearFrom }),
          ...(options.yearTo === undefined ? {} : { yearTo: options.yearTo }),
          sort: options.sort,
          limit,
          page: Math.max(1, Math.trunc(options.page)),
        };
        return this.attempt<ItemRow>(source, mediaType, () => source.searchItems!(request));
      }),
    );

    const page = Math.max(1, Math.trunc(options.page));
    const groups = attempts.map((attempt) => attempt.rows.slice(0, limit));
    return {
      rows: interleave(groups),
      reports: [
        ...attempts.map((attempt, index) => reportOf(attempt, groups[index]!.length, page, limit)),
        ...[...byCapability.absent, ...byVocabulary.absent].map(absentReport),
      ],
      asked: attempts.length,
    };
  }

  /**
   * Read one record, from whichever archive the identifier names.
   *
   * Only that archive is called. Trying another after a miss would answer "this
   * archive has no record by this name" with somebody else's record under a
   * different title.
   */
  async getItem(
    id: string,
  ): Promise<{ item: ItemDetail; cached: boolean; read: ResolvedId; report: SourceReport }> {
    const read = resolveId(id, this.sources);

    if (!read.source.answers.includes("get_item")) {
      throw invalidInput(
        `${read.source.name} cannot be asked for one record by its identifier.`,
        read.source.cannot.get_item ?? "Ask an archive that reads a record on its own.",
      );
    }

    try {
      const outcome = await withDeadline(
        read.source.getItem!(read.reference),
        this.deadlineFor(read.source),
        read.source,
      );
      return {
        item: outcome.item,
        cached: outcome.cached,
        read,
        report: {
          source: read.source.id,
          name: read.source.name,
          status: "answered",
          // No search happened here: the identifier named the archive, and the
          // only moment there was to fail is the read.
          stage: "read",
          absentBecause: null,
          count: 1,
          reportedTotal: null,
          reportedTotalMeans: null,
          skipped: 0,
          orderedOn: null,
          mediaTypeAsked: null,
          moreOnThisArchive: null,
          cached: outcome.cached,
          error: null,
        },
      };
    } catch (error) {
      const known = toBooksError(error);
      // The archive and the moment travel with the failure, so a caller never
      // has to work out whether the question or the answer was the problem.
      throw new BooksError(
        known.code,
        `${read.source.name} was asked for "${read.reference}" and the read failed: ${known.message}`,
        known.details,
      );
    }
  }

  /** A failure here becomes a reported attempt rather than a throw, so one archive cannot end the call. */
  private async attempt<T>(
    source: SourceAdapter,
    mediaTypeAsked: string | null,
    work: () => Promise<{
      rows: T[];
      skipped: number;
      reportedTotal: number | null;
      reportedTotalMeans: string | null;
      orderedOn: string | null;
      cached: boolean;
    }>,
  ): Promise<Attempt<T>> {
    try {
      const read = await withDeadline(work(), this.deadlineFor(source), source);
      if (read.skipped > 0) {
        this.logger.warn(
          `${source.name} sent ${read.skipped} row(s) this server could not read; they were left out.`,
        );
      }
      return {
        source,
        rows: read.rows,
        cached: read.cached,
        reportedTotal: read.reportedTotal,
        reportedTotalMeans: read.reportedTotalMeans,
        orderedOn: read.orderedOn,
        mediaTypeAsked,
        // An answer served from a reader's cache carries the rows it kept and
        // no record of what was dropped while they were first read, so the
        // count is unknown here rather than zero.
        skipped: read.cached ? null : read.skipped,
        error: null,
      };
    } catch (error) {
      const known = toBooksError(error);
      this.logger.warn(`${source.name} did not answer: [${known.code}] ${known.message}`);
      return {
        source,
        rows: [],
        cached: false,
        reportedTotal: null,
        reportedTotalMeans: null,
        orderedOn: null,
        mediaTypeAsked,
        skipped: 0,
        error: {
          code: known.code,
          message: known.message,
          ...(known.details.hint ? { hint: known.details.hint } : {}),
        },
      };
    }
  }
}

function boundedLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_LIMIT_PER_SOURCE, Math.trunc(limit)));
}

/** The capabilities the registered archives answer between them. */
export function capabilitiesOf(sources: readonly SourceAdapter[]): Set<Capability> {
  const found = new Set<Capability>();
  for (const source of sources) for (const answer of source.answers) found.add(answer);
  return found;
}
