/**
 * The archives this server reads.
 *
 * One list, and everything above it is written for however long the list is.
 * Adding an archive means writing an adapter and adding it here; no tool, no
 * merge and no error path has a branch per source.
 *
 * Pacing is settled here rather than in a tool, because it belongs to the
 * archive and not to the question. Each adapter states the spacing its own
 * archive is owed, a setting can widen that spacing, and nothing can narrow it.
 */

import { ArchiveClient } from "mcp-archiveorg/client";
import { BnfClient } from "mcp-databnf/client";
import { LocClient } from "mcp-libraryofcongress/client";

import type { Config } from "../config.js";
import { invalidInput } from "../errors.js";
import type { Capability, SourceId, SourceProfile } from "../types.js";
import type { SourceAdapter } from "./adapter.js";
import { ARCHIVE_PROFILE, archiveAdapter } from "./archive.js";
import type { ArchiveReader } from "./archive.js";
import { BNF_PROFILE, bnfAdapter } from "./bnf.js";
import type { BnfReader } from "./bnf.js";
import { LOC_PROFILE, locAdapter } from "./loc.js";
import type { LocReader } from "./loc.js";

/**
 * A reader may be supplied in place of the one that talks to an archive, so a
 * program embedding this server can put its own cache in front of a corpus, and
 * a test can drive it from fixed answers.
 */
export interface Readers {
  archive?: ArchiveReader;
  loc?: LocReader;
  bnf?: BnfReader;
}

/** What this build registers, in the order an answer takes them. */
export const SOURCE_PROFILES: readonly SourceProfile[] = [
  ARCHIVE_PROFILE,
  LOC_PROFILE,
  BNF_PROFILE,
];

/** The archives a caller can name, in the order an answer takes them. */
export const SOURCE_IDS: readonly SourceId[] = SOURCE_PROFILES.map((profile) => profile.id);

/**
 * Every name any registered archive files a kind of material under.
 *
 * The list is the union rather than an intersection, and it is not a shared
 * vocabulary: `texts` and `books` name different sets, held by different
 * archives. A name only one archive uses is offered so a caller can reach that
 * archive's own catalogue, and the archives that do not use it are named as
 * absent from that call rather than asked under a translation.
 */
export const MEDIA_TYPES: readonly string[] = [
  ...new Set(SOURCE_PROFILES.flatMap((profile) => profile.mediaTypes)),
].sort();

/** The spacing an archive gets: its own, or a wider one a setting asked for. */
export function pacingFor(config: Config, ownMs: number): number {
  return Math.max(ownMs, config.minIntervalMs ?? 0);
}

export function buildSources(config: Config, readers: Readers = {}): SourceAdapter[] {
  const shared = {
    userAgent: config.userAgent,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    cacheTtlMs: config.cacheTtlMs,
    cacheMaxEntries: config.cacheMaxEntries,
    logLevel: config.logLevel,
  };

  const archive =
    readers.archive ??
    new ArchiveClient({
      config: { ...shared, minIntervalMs: pacingFor(config, ARCHIVE_PROFILE.paceMs) },
    });

  const loc =
    readers.loc ??
    new LocClient({
      config: {
        ...shared,
        minIntervalMs: pacingFor(config, LOC_PROFILE.paceMs),
        // Reading the text of millions of pages takes the Library longer than
        // answering from a catalogue, so that route keeps the same deadline
        // rather than inheriting a shorter one.
        newspaperTimeoutMs: config.timeoutMs,
      },
    });

  const bnf =
    readers.bnf ??
    new BnfClient({
      config: { ...shared, minIntervalMs: pacingFor(config, BNF_PROFILE.paceMs) },
    });

  return [archiveAdapter(archive), locAdapter(loc), bnfAdapter(bnf)];
}

/** The archives a caller asked for, in the registry's own order. */
export function selectSources(
  sources: SourceAdapter[],
  wanted: readonly SourceId[] | undefined,
): SourceAdapter[] {
  if (!wanted) {
    return sources;
  }

  const unknown = wanted.filter((id) => !sources.some((source) => source.id === id));
  if (unknown.length > 0) {
    throw invalidInput(
      `This server reads no archive called ${unknown.map((id) => `"${id}"`).join(", ")}.`,
      `It reads ${sources.map((source) => source.id).join(", ")}.`,
    );
  }

  const chosen = sources.filter((source) => wanted.includes(source.id));
  if (chosen.length === 0) {
    throw invalidInput(
      "A search needs at least one archive.",
      `Name one of ${sources.map((source) => source.id).join(", ")}, or leave the argument out to ask them all.`,
    );
  }
  return chosen;
}

/** An archive that will not be asked, and the reason a caller has to hear. */
export interface Absence {
  source: SourceAdapter;
  because: string;
}

/** The method an archive answers a given call with. */
type MethodFor<C extends Capability> = C extends "search_inside"
  ? "searchInside"
  : C extends "search_items"
    ? "searchItems"
    : "getItem";

/**
 * An archive that answers one particular call.
 *
 * The method is optional on the adapter, because no archive answers every call.
 * Splitting on the capability is what establishes that this one does, so the
 * split says it in the type rather than leaving every call site to assert it.
 */
export type Answering<C extends Capability> = SourceAdapter &
  Required<Pick<SourceAdapter, MethodFor<C>>>;

/**
 * Split the chosen archives into those that answer a call and those that do
 * not.
 *
 * An archive missing a capability is returned here rather than filtered away,
 * so the answer can name it. Dropping it silently would narrow an answer while
 * leaving it looking like the whole of what the server reads.
 */
export function splitByCapability<C extends Capability>(
  sources: readonly SourceAdapter[],
  capability: C,
): { able: Answering<C>[]; absent: Absence[] } {
  const able: Answering<C>[] = [];
  const absent: Absence[] = [];

  for (const source of sources) {
    if (source.answers.includes(capability)) {
      able.push(source as Answering<C>);
      continue;
    }
    absent.push({
      source,
      because:
        source.cannot[capability] ??
        `${source.name} does not answer this question, and no reason was recorded for it.`,
    });
  }

  return { able, absent };
}
