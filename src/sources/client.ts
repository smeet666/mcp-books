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
 * One thing does place a match ahead of another, and it is a property the row
 * states rather than a score: an excerpt that carries the searched words comes
 * before an excerpt that is the opening of a page and does not carry them.
 *
 * A question is also put in more than one wording. An index that answers only
 * where every word given appears comes back empty on a question written as a
 * sentence, even for a work the archive holds several copies of, and that
 * emptiness is indistinguishable from a corpus holding nothing. An index that
 * ranks the words instead answers the same question with whatever it scores
 * highest. Each archive is therefore
 * offered a short ladder of wordings derived from the query, in sequence so its
 * pacing is kept, stopping as soon as the rows asked for are found. What the
 * union holds is deduplicated on the identifier this server hands out, and
 * every wording travels with the answer so it can be redone by hand.
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
  CatalogueFilter,
  DroppedFilter,
  Hit,
  ItemDetail,
  ItemRow,
  MergedHits,
  MergedItems,
  QueryAttempt,
  SourceId,
  SourceProfile,
  SourceReport,
} from "../types.js";
import type { CatalogueQuery, ReadRows, SortKey, SourceAdapter } from "./adapter.js";
import { resolveId } from "./ids.js";
import type { ResolvedId } from "./ids.js";
import { buildSources, pacingFor, selectSources, splitByCapability } from "./registry.js";
import type { Absence, Readers } from "./registry.js";
import { MAX_QUERIES_PER_SOURCE, deriveQueries } from "./variants.js";
import type { QueryVariant } from "./variants.js";

export type {
  Capability,
  CatalogueFilter,
  DroppedFilter,
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
export type { BnfReader } from "./bnf.js";
export type { LocReader } from "./loc.js";
export type { Absence, Readers } from "./registry.js";
export { CAPABILITIES, CATALOGUE_FILTERS } from "../types.js";
export { SORT_KEYS } from "./adapter.js";
export { MEDIA_TYPES, SOURCE_IDS, SOURCE_PROFILES, splitByCapability } from "./registry.js";
export { namespacedId, resolveId } from "./ids.js";
export { MAX_QUERIES_PER_SOURCE, deriveQueries } from "./variants.js";
export type { QueryVariant } from "./variants.js";
export type { QueryAttempt } from "../types.js";

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
  /** What the archive said about rows past this page, where it says instead of counting. */
  hasMore: boolean | null;
  attribution: string | null;
  skipped: number;
  error: { code: string; message: string; hint?: string } | null;
  /** Every wording derived for this archive, sent or withheld. */
  queries: QueryAttempt[];
  /**
   * Rows the words as asked returned on their own.
   *
   * The archive's own total counts what that wording matches across every page,
   * so it is only comparable with the rows that wording brought back. Comparing
   * it against a union built out of several wordings would count rows the total
   * never counted.
   */
  primaryCount: number;
  /** The wording the archive's own total was reported for. */
  totalFromQuery: string | null;
  /** Whether a later wording contributed rows the total never counted. */
  beyondThatWording: boolean;
}

/** Whether an answer may be built out of more than the words as asked. */
export interface FanOut {
  /** False sends the words as asked and nothing else. */
  enabled: boolean;
  /**
   * The page being read. Derived wordings run on the first page alone: each
   * archive pages each wording on its own count, so page three of a union is
   * not the third page of anything a caller could ask for by hand.
   */
  page: number;
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
  filtersDropped: DroppedFilter[] = [],
): SourceReport {
  // An archive counts what one wording matches. Where a later wording brought
  // back rows of its own, that number counts neither them nor the list they are
  // in, and reporting it beside them says a count of nothing sits above rows
  // the same archive published. It keeps the number and says what it counts.
  const acrossWordings = attempt.beyondThatWording && attempt.totalFromQuery !== null;
  const means =
    attempt.reportedTotalMeans === null
      ? null
      : acrossWordings
        ? `${attempt.reportedTotalMeans}. ${attempt.source.name} reported that count for the wording "${attempt.totalFromQuery}" alone, and rows here came back under a further wording it never counted`
        : attempt.reportedTotalMeans;

  return {
    source: attempt.source.id,
    name: attempt.source.name,
    status: attempt.error ? "failed" : "answered",
    stage: "search",
    absentBecause: null,
    count,
    reportedTotal: attempt.reportedTotal,
    reportedTotalMeans: means,
    skipped: attempt.skipped,
    orderedOn: attempt.orderedOn,
    mediaTypeAsked: attempt.mediaTypeAsked,
    attribution: attempt.attribution ?? attempt.source.attribution,
    filtersDropped,
    // An archive that says whether anything follows this page is taken at its
    // word; one that publishes a count instead has the question answered from
    // the count and the page, which is the only way to ask it there. Neither
    // answer covers a list built out of more than one wording: each wording
    // pages on a count of its own, so nothing here establishes what follows.
    moreOnThisArchive:
      attempt.error || acrossWordings
        ? null
        : (attempt.hasMore ??
          moreBeyond(attempt.reportedTotal, page, limit, Math.min(attempt.primaryCount, limit))),
    queries: attempt.queries,
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
    // An archive that was never asked published nothing here, and a credit
    // naming it would say it had.
    attribution: null,
    filtersDropped: [],
    moreOnThisArchive: null,
    queries: [],
    cached: false,
    error: null,
  };
}

/**
 * The narrowings a caller asked for that one archive's catalogue cannot apply.
 *
 * They are worked out before anything is sent, because a narrowing an archive
 * cannot apply is never sent to it: the alternative is an answer that reports a
 * criterion as applied by every archive in it while one of them was asked a
 * question with no criterion in it at all.
 */
export function droppedFilters(
  source: SourceProfile,
  wanted: readonly CatalogueFilter[],
): DroppedFilter[] {
  return wanted
    .filter((filter) => !source.honours.includes(filter))
    .map((filter) => ({
      filter,
      because:
        source.cannotFilter[filter] ??
        `${source.name} does not apply this, and no reason was recorded for it.`,
    }));
}

/**
 * Refuse a year range that names no year.
 *
 * A range whose earliest bound is later than its latest describes an empty
 * span, and an index has no way to apply it: one archive answers with nothing,
 * another treats the pair as unusable and answers as though no range had been
 * given. Both are the archive's own reading, neither is reportable as the range
 * having been applied, and the archive that ignored it hands back rows outside
 * the span with nothing to mark them.
 *
 * It is refused here rather than dropped per archive. A narrowing named as
 * dropped is one a catalogue cannot express, which this range is not: it is a
 * request no archive can answer, present or future, so a refusal is what it is
 * owed, and the caller is told which way round the bounds go.
 */
function checkYearRange(yearFrom?: number, yearTo?: number): void {
  if (yearFrom === undefined || yearTo === undefined || yearFrom <= yearTo) return;
  throw invalidInput(
    `year_from ${yearFrom} is later than year_to ${yearTo}, so the range names no year and no archive can be narrowed to it.`,
    `Ask for year_from ${yearTo} and year_to ${yearFrom} to search that span, or give one bound and leave the other out.`,
  );
}

/** The narrowings this call actually carries, named as a caller names them. */
function filtersAsked(options: {
  yearFrom?: number;
  yearTo?: number;
  sort: SortKey;
}): CatalogueFilter[] {
  const wanted: CatalogueFilter[] = [];
  if (options.yearFrom !== undefined || options.yearTo !== undefined) wanted.push("year_range");
  // Relevance is what an archive does when nothing is asked of it, so asking
  // for it narrows nothing and there is nothing to report as dropped.
  if (options.sort !== "relevance") wanted.push("sort");
  return wanted;
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

/**
 * Put matches whose excerpt carries the searched words before matches whose
 * excerpt does not.
 *
 * An archive sends the opening of a page instead of the passage when the
 * machine-read text it returned stops before the searched words appear, and it
 * says so on the row. Such an excerpt does not hold the match, so a reader who
 * takes it for one is reading text that has nothing to do with the question.
 *
 * The property this orders on is one each row states about itself, so no score
 * is compared across archives and no relevance is invented. The partition is
 * stable, which leaves the one-from-each-archive order standing inside each of
 * the two groups. Nothing is removed: a row sending an opening still names a
 * page where the words were found, and it stays in the answer after the rows
 * that show them.
 */
export function carryingTheWordsFirst(hits: readonly Hit[]): Hit[] {
  return [
    ...hits.filter((hit) => hit.excerptKind === "passage"),
    ...hits.filter((hit) => hit.excerptKind !== "passage"),
  ];
}

/**
 * What to make of an archive that answered about an identifier and served no
 * record this server could read whole.
 *
 * An archive answers about identifiers it holds no record of its own for: a
 * page inside something larger, a heading its catalogue files under a shape a
 * record does not take. A search hands those identifiers out, so reading one is
 * a question the archive answered rather than a defect, and a caller told to
 * open a bug report is told to report the archive's own arrangement of its
 * holdings. What is left to do is open the address the row already carries.
 */
const servesNoWholeRecord = (name: string): string =>
  `${name} answered about this identifier and served no whole record for it. Some of the ` +
  "identifiers a search hands back name something an archive does not keep a record of its own " +
  "for, and there is nothing here to read: open the source_url the row carried to see what sits " +
  "at that identifier.";

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
   * The longest one read of one archive can take before this client gives up
   * on it and says so.
   *
   * Reaching it produces an error naming the archive and the moment. Anything
   * waiting on this client that gives up sooner replaces that error with its
   * own silence, so a caller holding a deadline of its own wants this number
   * rather than one written by hand.
   */
  get slowestDeadlineMs(): number {
    return Math.max(0, ...this.sources.map((source) => this.deadlineFor(source)));
  }

  /**
   * The longest one search can take, over every archive at once.
   *
   * A search sends a ladder of wordings to each archive in turn, so one call
   * can spend the backstop over one archive once per wording it is entitled to
   * send. The archives are asked together, which is why this is the cost of the
   * slowest of them rather than the sum of all.
   */
  get slowestAnswerMs(): number {
    return this.slowestDeadlineMs * MAX_QUERIES_PER_SOURCE;
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
      /** Left unset, further wordings are derived and asked for their union. */
      fanOut?: boolean;
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
    const page = Math.max(1, Math.trunc(options.page));
    const ladder = this.ladderFor(trimmed, { enabled: options.fanOut !== false, page });

    const attempts = await Promise.all(
      able.map((source) =>
        this.askLadder<Hit>(source, ladder, limit, null, (query) =>
          source.searchInside!({
            query,
            limit,
            page,
            maxExcerptChars: options.maxExcerptChars,
            maxExcerptsPerMatch: options.maxExcerptsPerMatch,
          }),
        ),
      ),
    );

    const groups = attempts.map((attempt) => attempt.rows.slice(0, limit));
    return {
      hits: carryingTheWordsFirst(interleave(groups)),
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
      /** Left unset, further wordings are derived and asked for their union. */
      fanOut?: boolean;
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
    checkYearRange(options.yearFrom, options.yearTo);

    const chosen = selectSources(this.sources, wanted);
    const byCapability = splitByCapability(chosen, "search_items");
    const byVocabulary = chooseMediaTypes(byCapability.able, options.mediaType);
    const limit = boundedLimit(options.limit);
    const able = byCapability.able.filter((source) => byVocabulary.asked.has(source.id));
    const page = Math.max(1, Math.trunc(options.page));
    const ladder = this.ladderFor(trimmed, { enabled: options.fanOut !== false, page });

    const narrowings = filtersAsked(options);
    const dropped = new Map(able.map((source) => [source.id, droppedFilters(source, narrowings)]));

    const attempts = await Promise.all(
      able.map((source) => {
        const mediaType = byVocabulary.asked.get(source.id) ?? null;
        const missing = new Set((dropped.get(source.id) ?? []).map((entry) => entry.filter));
        return this.askLadder<ItemRow>(source, ladder, limit, mediaType, (query) => {
          const request: CatalogueQuery = {
            query,
            mediaType,
            // A narrowing this archive cannot apply is left out of the request
            // rather than sent and ignored, so what it received and what the
            // answer says it received are the same thing.
            ...(options.yearFrom === undefined || missing.has("year_range")
              ? {}
              : { yearFrom: options.yearFrom }),
            ...(options.yearTo === undefined || missing.has("year_range")
              ? {}
              : { yearTo: options.yearTo }),
            sort: missing.has("sort") ? null : options.sort,
            limit,
            page,
          };
          return source.searchItems!(request);
        });
      }),
    );

    const groups = attempts.map((attempt) => attempt.rows.slice(0, limit));
    return {
      rows: interleave(groups),
      reports: [
        ...attempts.map((attempt, index) =>
          reportOf(
            attempt,
            groups[index]!.length,
            page,
            limit,
            dropped.get(attempt.source.id) ?? [],
          ),
        ),
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
          attribution: outcome.item.attribution,
          // A read by identifier carries no narrowing to drop.
          filtersDropped: [],
          moreOnThisArchive: null,
          // A record is read by its identifier, so there is no wording to derive.
          queries: [],
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
        known.code === "parse_failure"
          ? { ...known.details, hint: servesNoWholeRecord(read.source.name) }
          : known.details,
      );
    }
  }

  /**
   * The wordings this call will offer each archive, and how many it may send.
   *
   * The list is settled once for the whole call rather than per archive, so
   * every archive is asked the same question in the same words and an answer
   * holding rows from two of them is not two different questions merged.
   */
  private ladderFor(query: string, fanOut: FanOut): LadderPlan {
    const derived = deriveQueries(query);
    if (!fanOut.enabled) {
      return {
        variants: derived,
        ceiling: 1,
        withheldBecause:
          "fan_out was off, so the words as asked were sent and no wording was derived from them",
      };
    }
    if (fanOut.page > 1) {
      return {
        variants: derived,
        ceiling: 1,
        withheldBecause:
          "beyond the first page only the words as asked are sent, because each archive pages each wording on a count of its own",
      };
    }
    return {
      variants: derived,
      ceiling: MAX_QUERIES_PER_SOURCE,
      withheldBecause: `the ceiling of ${MAX_QUERIES_PER_SOURCE} queries to one archive was reached`,
    };
  }

  /**
   * Put the wordings to one archive, one after another, and union what returns.
   *
   * They go out in sequence rather than together because the spacing this
   * server owes an archive is per archive: firing three wordings at once would
   * keep the letter of the interval on paper and none of it in practice.
   *
   * Three things end the sequence early. The ceiling, so a call cannot grow
   * without bound. Enough rows to answer what the caller asked for, so the
   * usual question costs exactly one request. And a failure, because an archive
   * that is not answering is not one to send further wordings to, and its
   * silence is reported as a failure rather than as an absence.
   */
  private async askLadder<T extends { id: string }>(
    source: SourceAdapter,
    plan: LadderPlan,
    limit: number,
    mediaTypeAsked: string | null,
    work: (query: string) => Promise<ReadRows<T>>,
  ): Promise<Attempt<T>> {
    const queries: QueryAttempt[] = [];
    const rows: T[] = [];
    const seen = new Set<string>();
    let first: ReadRows<T> | null = null;
    let primaryCount = 0;
    let totalFromQuery: string | null = null;
    let beyondThatWording = false;
    let cached = false;
    let skipped = 0;
    let error: Attempt<T>["error"] = null;
    let stopped: string | null = null;

    for (const [index, variant] of plan.variants.entries()) {
      const withheld =
        stopped ??
        (index >= plan.ceiling
          ? plan.withheldBecause
          : index > 0 && rows.length >= limit
            ? "the wordings already sent returned as many rows as were asked for"
            : null);

      if (withheld !== null) {
        queries.push(unsent(variant, withheld));
        continue;
      }

      try {
        const read = await withDeadline(work(variant.query), this.deadlineFor(source), source);
        let added = 0;
        for (const row of read.rows) {
          // Deduplication is on the identifier this server hands out, which
          // names its archive: the same string from two archives is two
          // records, and folding them together would drop one of them.
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          // The wording rides on the row from here, so a reader holding one row
          // can tell how much of the question it answers. A row a later wording
          // repeats keeps the wording that first returned it, which is the one
          // that reached it.
          rows.push({
            ...row,
            foundByQuery: variant.query,
            foundByDerivation: variant.derivation,
          });
          added += 1;
        }
        if (first !== null && added > 0) beyondThatWording = true;
        if (read.skipped > 0) {
          this.logger.warn(
            `${source.name} sent ${read.skipped} row(s) this server could not read; they were left out.`,
          );
        }
        if (read.cached) cached = true;
        // The rows in hand are counted the same way whether they were just
        // read or kept from an earlier read, so the count keeps one shape. What
        // an earlier read dropped before keeping the rest is nobody's count,
        // and 'cached' is where a caller sees that this one can be short of it.
        skipped += read.skipped;
        if (first === null) {
          first = read;
          primaryCount = read.rows.length;
          totalFromQuery = variant.query;
        }
        queries.push({
          query: variant.query,
          derivation: variant.derivation,
          ran: true,
          count: read.rows.length,
          added,
          notRunBecause: null,
          error: null,
        });
      } catch (raised) {
        const known = toBooksError(raised);
        this.logger.warn(`${source.name} did not answer: [${known.code}] ${known.message}`);
        const failure = {
          code: known.code,
          message: known.message,
          ...(known.details.hint ? { hint: known.details.hint } : {}),
        };
        queries.push({
          query: variant.query,
          derivation: variant.derivation,
          ran: true,
          count: null,
          added: null,
          notRunBecause: null,
          error: failure,
        });
        // An archive that answered the words as asked has answered the
        // question. A wording this server derived failing afterwards is a
        // failure of that wording, and reporting it as an archive that did not
        // answer would throw away rows the archive did give.
        if (first === null) error = failure;
        stopped = `${source.name} did not answer the wording before this one`;
      }
    }

    return {
      source,
      rows,
      cached,
      reportedTotal: first?.reportedTotal ?? null,
      reportedTotalMeans: first?.reportedTotalMeans ?? null,
      orderedOn: first?.orderedOn ?? null,
      mediaTypeAsked,
      hasMore: first?.hasMore ?? null,
      attribution: first?.attribution ?? null,
      skipped,
      error,
      queries,
      primaryCount,
      totalFromQuery,
      beyondThatWording,
    };
  }
}

/** The wordings on offer for one call, and how many of them may be sent. */
interface LadderPlan {
  variants: readonly QueryVariant[];
  ceiling: number;
  /** Why a wording past the ceiling was left unsent, in words. */
  withheldBecause: string;
}

function unsent(variant: QueryVariant, because: string): QueryAttempt {
  return {
    query: variant.query,
    derivation: variant.derivation,
    ran: false,
    count: null,
    added: null,
    notRunBecause: because,
    error: null,
  };
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
