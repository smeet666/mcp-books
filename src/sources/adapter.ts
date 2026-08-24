/**
 * What an archive has to provide to be a source.
 *
 * Everything above this file is written for however many sources the registry
 * holds. A source knows five things nothing else does: what it is called, which
 * identifiers it mints, which of the three calls it can answer, how to make
 * those calls, and what its own numbers count. Adding an archive is writing
 * those and registering it.
 *
 * An archive that cannot answer one of the calls declares that instead of the
 * method. It is then reported as absent from that tool with the reason, rather
 * than quietly narrowing the answer to whoever was left.
 *
 * The helpers below are the ones every adapter needs, because no archive
 * answers with a contract: a field can arrive missing, null, or holding
 * something other than the type it usually holds.
 */

import { parseFailure } from "../errors.js";
import type { Hit, ItemDetail, ItemRow, SourceId, SourceProfile } from "../types.js";

/** What one archive returned for one question. */
export interface ReadRows<T> {
  rows: T[];
  /** Rows the archive sent in a shape this server could not read. */
  skipped: number;
  /** What the archive said it saw, in the terms it counts in. */
  reportedTotal: number | null;
  /** What `reportedTotal` counts on this archive, in words. Null when it states none. */
  reportedTotalMeans: string | null;
  /** The order the archive put its own rows in, in words. */
  orderedOn: string | null;
  /**
   * Whether the archive answered with at least one row past the page just
   * read. Left unset by an archive that publishes a total instead, where the
   * total and the page decide it.
   */
  hasMore?: boolean | null;
  /**
   * What a caller has to say when repeating these rows, where the archive asks
   * for more than its name. Left unset where its name is the whole of it.
   */
  attribution?: string | null;
  cached: boolean;
}

export interface ReadDetail {
  item: ItemDetail;
  cached: boolean;
}

/** Words to look for, and how much of the answer a caller will take. */
export interface InsideQuery {
  query: string;
  limit: number;
  page: number;
  maxExcerptChars: number;
  maxExcerptsPerMatch: number;
}

/** A catalogue question, in the vocabulary of whichever archive receives it. */
export interface CatalogueQuery {
  query: string;
  /** Already translated into this archive's own name for a kind of material. */
  mediaType: string | null;
  /**
   * Absent on an archive whose catalogue applies no year range. It is left out
   * rather than sent and ignored, so nothing downstream can report a narrowing
   * as applied by an archive that never received it.
   */
  yearFrom?: number;
  yearTo?: number;
  /** Null on an archive that puts its rows in an order of its own whatever is asked. */
  sort: SortKey | null;
  limit: number;
  page: number;
}

/** Orders every archive here can put a catalogue answer in. */
export type SortKey = "relevance" | "newest" | "oldest" | "title";

export const SORT_KEYS: readonly SortKey[] = ["relevance", "newest", "oldest", "title"];

/** How an archive recognised a raw identifier as one of its own. */
export interface Claim {
  /** The string this archive's own reader takes. */
  reference: string;
  /** Why the shape was read this way, for an answer that has to say so. */
  why: string;
  /**
   * Whether reading it this way is a guess. A shape only this archive mints is
   * not; a shape it would merely accept is, and the answer says so.
   */
  guess: boolean;
}

export interface SourceAdapter extends SourceProfile {
  /**
   * Recognise a raw identifier, or decline it.
   *
   * An archive claims a shape it mints and declines everything else, so a
   * string no archive claims is refused instead of being sent somewhere that
   * would answer it with a confident absence.
   */
  claims: (raw: string) => Claim | null;
  /**
   * The spacing this archive's reader is keeping right now, when it says.
   *
   * A reader widens its own spacing after an archive asks it to slow down, and
   * a reader supplied by a caller was never started on the registry's number.
   * Reporting the registry's number in either case would announce a promise the
   * running client is not the one keeping.
   */
  observedPaceMs?: () => number | null;
  searchInside?: (query: InsideQuery) => Promise<ReadRows<Hit>>;
  searchItems?: (query: CatalogueQuery) => Promise<ReadRows<ItemRow>>;
  getItem?: (reference: string) => Promise<ReadDetail>;
}

/* -------------------------------------------------------------------------- */
/* Reading a value an archive sent, without trusting its shape                 */
/* -------------------------------------------------------------------------- */

/**
 * The distinction these draw is between a row and a record. One row this server
 * cannot read is dropped and counted, because the rest of the list is still a
 * good answer. A record it cannot read is `parse_failure`, because there is
 * nothing left to return and a caller told "network_error" would retry an
 * archive that has actually changed.
 */
export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

export function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function whole(value: unknown): number | null {
  const read = count(value);
  return read === null ? null : Math.trunc(read);
}

export function required(value: unknown, field: string, source: SourceProfile): string {
  const found = text(value);
  if (found === null) {
    throw parseFailure(
      `${source.name} answered without a readable "${field}", so there is no record to return.`,
    );
  }
  return found;
}

export function rowsOf<T>(value: unknown, source: SourceProfile): T[] {
  if (!Array.isArray(value)) {
    throw parseFailure(
      `${source.name} answered in a shape this server could not read: the list of results was missing.`,
    );
  }
  return value as T[];
}

/**
 * An archive's own identifier, or nothing.
 *
 * An identifier is a token an archive mints, so it carries no space and no
 * control character. A string that does carry one is not an identifier, and
 * letting it through would put a value that can open a line of its own into
 * every place this server prints an identifier, and into every address built
 * from one.
 */
export function reference(value: unknown): string | null {
  const found = text(value);
  if (found === null) {
    return null;
  }
  return /[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(found) ? null : found;
}

/** Build the identifier this server hands out for a row from an archive. */
export function namespacedId(source: SourceId, own: string): string {
  return `${source}:${own}`;
}

/**
 * The words a query looks for, as they can be found in a passage.
 *
 * A quoted phrase is one term. Everything else is split into words, and words
 * of two letters or fewer are dropped, because an article locates nothing.
 */
export function queryTerms(query: string): string[] {
  const terms: string[] = [];
  for (const phrase of query.match(/"[^"]+"/g) ?? []) {
    const inner = phrase.slice(1, -1).trim().toLowerCase();
    if (inner !== "") {
      terms.push(inner);
    }
  }
  for (const word of query.replace(/"[^"]*"/g, " ").split(/[^\p{L}\p{N}'-]+/u)) {
    const lower = word.trim().toLowerCase();
    if (lower.length > 2) {
      terms.push(lower);
    }
  }
  return [...new Set(terms)];
}

/**
 * Cut a passage to the budget a caller set, keeping the words that matched.
 *
 * A passage is only a passage while it carries the match. Cutting from the
 * start of a snippet an archive centred on the match can leave a window that
 * carries none of the searched words, which is the opening of a snippet
 * presented as the place the archive matched. The window is therefore centred
 * on the first term that can be found, and falls back to the start only when
 * none can be.
 *
 * Machine-read text runs together, so the cut is widened to the nearest space:
 * a cut mid-word invites a reader to complete it.
 */
export function trimExcerpt(
  passage: string,
  maxChars: number,
  terms: readonly string[] = [],
): string {
  const clean = passage.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) {
    return clean;
  }

  const haystack = clean.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = haystack.indexOf(term);
    if (found !== -1 && (at === -1 || found < at)) {
      at = found;
    }
  }

  if (at === -1) {
    return `${cutAtSpace(clean, 0, maxChars)}…`;
  }

  const half = Math.max(0, Math.floor(maxChars / 2));
  const start = Math.max(0, at - half);
  const body = cutAtSpace(clean, start, maxChars);
  return `${start > 0 ? "…" : ""}${body}${start + body.length < clean.length ? "…" : ""}`;
}

/** A window that opens and closes on a word wherever one is near the cut. */
function cutAtSpace(written: string, start: number, maxChars: number): string {
  const opening = start === 0 ? 0 : written.indexOf(" ", start) + 1 || start;
  const window = written.slice(opening, opening + maxChars);
  if (opening + window.length >= written.length) {
    return window.trim();
  }
  const space = window.lastIndexOf(" ");
  return (space > maxChars / 2 ? window.slice(0, space) : window).trim();
}

/** The passages a hit keeps, cut to the caller's budget in both directions. */
export function budgetedExcerpts(
  passages: readonly unknown[],
  maxChars: number,
  maxCount: number,
  terms: readonly string[] = [],
): string[] {
  return textList(passages)
    .slice(0, maxCount)
    .map((passage) => trimExcerpt(passage, maxChars, terms));
}
