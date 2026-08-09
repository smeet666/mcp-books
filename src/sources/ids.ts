/**
 * Identifiers that name the archive they came from.
 *
 * Every archive hands back an opaque string, and the same string exists on more
 * than one of them meaning different things: a run of digits is a catalogue
 * number in one place and an upload's slug in another. Every identifier this
 * server returns therefore carries a prefix, and `get_item` routes on it rather
 * than trying each archive in turn.
 */

import { invalidInput } from "../errors.js";
import type { SourceId } from "../types.js";
import type { SourceAdapter } from "./adapter.js";

export { namespacedId } from "./adapter.js";

const SEPARATOR = ":";

/** A scheme, or the start of an authority, wherever it was written. */
const LOOKS_LIKE_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * A character that is removed or changed on its way into a rendered answer.
 *
 * Every value an answer quotes passes through the same escaping, which drops
 * these because they render as nothing and can rearrange the text around them.
 * An identifier carrying one would therefore be sent to an archive in one
 * spelling and named in the answer in another, so a caller would read a record
 * asked about under a name nobody asked about, and an absence stated of that
 * name was established about no record at all.
 */
const RENDERS_AS_NOTHING = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/**
 * Whether a string carries a path segment that walks upwards, read as written
 * and read again once its escapes have been resolved.
 */
function climbs(value: string): boolean {
  const readings = [value];
  try {
    readings.push(decodeURIComponent(value));
  } catch {
    // A percent sign opening no escape leaves one reading, which is enough.
  }
  return readings.some((reading) =>
    reading.split(/[/\\]/).some((segment) => /^\.+$/.test(segment)),
  );
}

export interface ResolvedId {
  source: SourceAdapter;
  /** The string that archive's own reader takes. */
  reference: string;
  /** Set when the shape was read rather than stated, so the answer can say so. */
  inferred: string | null;
}

/**
 * Work out which archive an identifier belongs to.
 *
 * A prefixed identifier is routed on what it says. A raw one is offered to each
 * archive in turn, and an archive claims only the shapes it mints. Exactly one
 * claim routes the read and the answer says which reading it used.
 *
 * More than one claim is refused rather than resolved, because picking a winner
 * would send the read somewhere a caller did not intend and answer with a
 * confident record about the wrong thing. No claim at all is refused too: a
 * title is a search, not an identifier, and guessing a record from it returns
 * whatever that guess happens to hit.
 */
export function resolveId(rawId: string, sources: readonly SourceAdapter[]): ResolvedId {
  const trimmed = rawId.trim();
  if (trimmed === "") {
    throw invalidInput(
      "A record identifier is required.",
      `Use one of the ids a search returned, such as ${example(sources)}.`,
    );
  }

  // Refused before anything is routed, and without quoting the string: quoting
  // it here would print the very spelling that differs from the one that would
  // have been sent, which is the confusion this refusal exists to prevent.
  if (RENDERS_AS_NOTHING.test(trimmed)) {
    throw invalidInput(
      "That identifier carries a control character, which renders as nothing and is no part of " +
        "any identifier an archive mints. Nothing was asked of any of them, because the record " +
        "asked about and the record this answer could name would not be the same one.",
      `Take the identifier from a search result, which reads like ${example(sources)}.`,
    );
  }

  // An identifier can carry a separator, so it can also carry a segment that
  // walks upwards. A segment made only of dots is resolved away when an address
  // is parsed, which walks a request out of the route it was meant for, and
  // percent-encoding hides it from a check that reads the string as written.
  // It is refused here rather than left to whichever reader receives it.
  if (climbs(trimmed)) {
    throw invalidInput(
      `"${trimmed}" is not an identifier: it carries a relative path segment.`,
      "Take the identifier from a search result rather than building one.",
    );
  }

  for (const source of sources) {
    const prefix = `${source.id}${SEPARATOR}`;
    if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const reference = trimmed.slice(prefix.length).trim();
    if (reference === "") {
      throw invalidInput(
        `"${trimmed}" names an archive and no record.`,
        "Put the archive's own identifier after the colon.",
      );
    }
    // The prefix says which archive to ask; it does not make what follows an
    // identifier. An address after the colon would send the read at a host the
    // named archive does not serve, so the shape is checked here too.
    if (LOOKS_LIKE_ADDRESS.test(reference) || climbs(reference)) {
      throw invalidInput(
        `"${reference}" is not an identifier ${source.name} would mint.`,
        `Pass the identifier a search returned, spelled "${source.id}:<the archive's own id>".`,
      );
    }
    return { source, reference, inferred: null };
  }

  const claimed = sources
    .map((source) => ({ source, claim: source.claims(trimmed) }))
    .filter((entry): entry is { source: SourceAdapter; claim: NonNullable<typeof entry.claim> } =>
      Boolean(entry.claim),
    );

  if (claimed.length > 1) {
    throw invalidInput(
      `"${trimmed}" is a shape ${names(claimed.map((entry) => entry.source))} both mint, so it names no one record.`,
      `Spell it with its archive, as in ${claimed.map((entry) => `${entry.source.id}:${trimmed}`).join(" or ")}.`,
    );
  }

  const only = claimed[0];
  if (!only) {
    throw invalidInput(
      `"${trimmed}" is not an identifier any of the archives this server reads would mint.`,
      `Call search_items with "${trimmed}" as the query and pass an id from a row, ` +
        `which reads like ${example(sources)}.`,
    );
  }

  return {
    source: only.source,
    reference: only.claim.reference,
    inferred: only.claim.guess
      ? `${only.claim.why}, which is a guess: check the record that comes back is the one you meant`
      : only.claim.why,
  };
}

/** Archives named the way a sentence names them. */
function names(sources: readonly { name: string }[]): string {
  const all = sources.map((source) => source.name);
  if (all.length <= 1) return all.join("");
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
}

/** An identifier of the shape this server hands out, for a hint. */
function example(sources: readonly SourceAdapter[]): string {
  const first = sources[0];
  return first ? `${first.id}${SEPARATOR}<the archive's own id>` : "<archive>:<id>";
}

/** Which archive an identifier names, without resolving what it points at. */
export function sourceOf(rawId: string, sources: readonly SourceAdapter[]): SourceId | null {
  const prefix = rawId.split(SEPARATOR)[0]?.toLowerCase();
  return sources.find((source) => source.id.toLowerCase() === prefix)?.id ?? null;
}
