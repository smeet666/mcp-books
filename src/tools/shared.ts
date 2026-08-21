/** Schemas, error mapping and rendering shared by the tools. */

import { z } from "zod";
import { BooksError } from "../errors.js";
import type { Hit, ItemRow, SourceReport } from "../types.js";

/** One wording put to one archive, or one derived and left unsent. */
export const querySchema = z.object({
  query: z.string().describe("The words this archive was given, exactly as they were sent."),
  derivation: z.string().describe("How this wording was arrived at from the question, in words."),
  ran: z.boolean().describe("Whether it was sent. False means it was derived and withheld."),
  count: z
    .number()
    .int()
    .nullable()
    .describe(
      "Rows the archive returned for this wording. Zero is that wording finding nothing, which is a statement about the wording. Null when it was not sent, or did not answer.",
    ),
  added: z
    .number()
    .int()
    .nullable()
    .describe(
      "Rows this wording contributed that an earlier one had not already returned. Null when it was not sent, or did not answer.",
    ),
  not_run_because: z.string().nullable().describe("Why it was withheld. Null when it was sent."),
  error: z
    .object({ code: z.string(), message: z.string(), hint: z.string().optional() })
    .nullable()
    .describe("Why this wording did not answer. Null when it did, or was never sent."),
});

/**
 * The text block is what many clients render, and some render nothing else, so
 * it has to answer on its own. This ceiling is what keeps ten matches carrying
 * three passages each from arriving as a wall of scanned text.
 */
export const MAX_BODY_CHARS = 3600;

/**
 * What every excerpt is worth, said once wherever excerpts appear.
 *
 * Optical recognition misreads a smudged letter, a broken type and a column
 * that ran into its neighbour, so a passage is evidence of what a machine read
 * rather than of what the page says.
 */
export const OCR_CAVEAT =
  "Every excerpt is what optical recognition read off a scanned page, so the words can be wrong. Quote them as scanned text and link the page.";

export interface ToolResult {
  // The SDK's result type carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * The wording a row came back under, on the row itself.
 *
 * A question reaches an archive in more than one wording, and a row found under
 * a reduction answers the words that reduction kept rather than the question as
 * written. A reader holding one row can act on that only if the row carries it,
 * so it travels here as well as in the trace of everything that was sent.
 */
const foundByFields = {
  found_by_query: z
    .string()
    .nullable()
    .describe(
      "The wording this archive was given that returned this row. It is the query as you wrote it unless a further wording was derived, in which case the row answers that wording's words and not the rest of the question.",
    ),
  found_by_derivation: z
    .string()
    .nullable()
    .describe("How that wording was arrived at from the question, in words."),
};

/**
 * One match inside machine-read text.
 *
 * Two fields carry a difference between the archives that no single name could
 * hold. `page_number` is null where the index knows no leaf, and a citation
 * naming a page the index does not know is a false citation. `excerpt_kind`
 * says whether the passages are the text that matched or the opening of the
 * page the match sits on, because those are different objects and reading one
 * as the other puts words in front of a reader that the excerpt does not carry.
 */
export const hitSchema = z.object({
  id: z.string().describe("Pass this to get_item. It names its archive, so nothing is guessed."),
  source: z.string().describe("Which archive published this match."),
  source_name: z.string(),
  identifier: z.string().describe("The archive's own identifier, without the prefix."),
  title: z.string().nullable(),
  creator: z.string().nullable(),
  year: z
    .number()
    .int()
    .nullable()
    .describe(
      "What this archive calls a year. The archives measure it on different things, so 'per_source' says what it means on each and no order is imposed across them.",
    ),
  page_number: z
    .number()
    .int()
    .nullable()
    .describe(
      "The leaf the passage sits on. Null on an archive whose full-text index holds no leaf number: read 'publishes_page_number' in 'per_source' to tell that from a row where a leaf simply was not given. Never invent one.",
    ),
  excerpts: z.array(z.string()).describe("Machine-read text, all of one kind for this match."),
  excerpt_kind: z
    .enum(["passage", "page_opening"])
    .describe(
      "'passage' means the text around the words that matched. 'page_opening' means the start of the page, sent because the machine-read text that came back with this row stops before the searched words appear. A page_opening does not carry the match.",
    ),
  source_url: z.string().describe("The page itself. Show this when citing the match."),
  matched_file: z
    .string()
    .nullable()
    .describe(
      "The document the passage sits in, when the record bundles several. Null when the record is the document.",
    ),
  inside_container: z
    .boolean()
    .describe(
      "True when the passage comes from a document bundled inside the record, in which case the title, creator and year above describe the container rather than the text that matched.",
    ),
  published_on: z
    .string()
    .nullable()
    .describe("Date of the issue, as published, on a corpus dated by issue."),
  publication: z
    .string()
    .nullable()
    .describe("The newspaper the page belongs to, where there is one."),
  ...foundByFields,
});

/** One catalogue row. */
export const rowSchema = z.object({
  id: z.string().describe("Pass this to get_item. It names its archive, so nothing is guessed."),
  source: z.string(),
  source_name: z.string(),
  identifier: z.string(),
  title: z.string().nullable(),
  creator: z.string().nullable(),
  year: z
    .number()
    .int()
    .nullable()
    .describe(
      "What this archive calls a year. Read 'per_source' for what it was measured on before comparing two of them.",
    ),
  date: z
    .string()
    .nullable()
    .describe("The date exactly as published, which is often a range or a phrase."),
  media_type: z
    .string()
    .nullable()
    .describe("What this archive calls the kind of thing, in its own vocabulary."),
  source_url: z.string(),
  downloads: z
    .number()
    .int()
    .nullable()
    .describe("Null on an archive that publishes no such count."),
  location: z
    .array(z.string())
    .nullable()
    .describe(
      "Places the record is catalogued under. Null on an archive that files no place against a catalogue row, which is a different thing from a record catalogued nowhere.",
    ),
  online: z
    .boolean()
    .nullable()
    .describe(
      "Whether a digitised copy can be read online. Null on an archive that states nothing about a copy against a catalogue row.",
    ),
  identifier_provisional: z
    .boolean()
    .nullable()
    .describe(
      "True where the archive itself calls this identifier provisional: it can be replaced once a cataloguer settles the record, so a citation carrying it can stop naming anything. Null on an archive that mints one kind of identifier and says nothing about settling it, which is not the same as an archive stating this one is settled.",
    ),
  ...foundByFields,
});

/**
 * What one archive did with one question, or why it was never asked.
 *
 * Present for every archive in scope, including the ones that failed and the
 * ones that cannot answer this question at all, because an answer that quietly
 * drops an archive reads as a complete answer that found less.
 */
export const reportSchema = z.object({
  source: z.string(),
  name: z.string(),
  status: z
    .enum(["answered", "failed", "absent"])
    .describe(
      "'answered' means it replied. 'failed' means it was asked and did not. 'absent' means it was never asked, and 'absent_because' says why.",
    ),
  stage: z
    .enum(["search", "read"])
    .nullable()
    .describe(
      "Which moment this report is about: the search that looks for records, or the read that opens one. Null on an archive that was never asked. A search that did not answer and a search that answered before a read failed are different statements.",
    ),
  absent_because: z
    .string()
    .nullable()
    .describe("Why this archive was left out. Null unless the status is absent."),
  count: z.number().int().describe("Rows this archive contributed to the answer."),
  reported_total: z
    .number()
    .int()
    .nullable()
    .describe("What this archive said it saw. Null when it states no number at all."),
  reported_total_means: z
    .string()
    .nullable()
    .describe(
      "What 'reported_total' counts on this archive. The archives count different things and these numbers are never added together.",
    ),
  skipped: z
    .number()
    .int()
    .describe(
      "Rows this archive sent in a shape the server could not read, and left out of this answer. Always a count, so it reads the same way on every answer. Rows served out of a cache were counted the same way when they were first read, and 'cached' marks an answer whose count can be short of a drop nobody kept a record of.",
    ),
  more_on_this_archive: z
    .boolean()
    .nullable()
    .describe(
      "Whether this archive says it holds matches beyond the page just read. Raise 'page' to read them. Null where it states no total, and on an archive that was never asked.",
    ),
  ordered_on: z
    .string()
    .nullable()
    .describe("What this archive ordered its own rows on. No order runs across archives."),
  media_type_asked: z
    .string()
    .nullable()
    .describe(
      "The name this archive was asked to look under, in its own vocabulary. Null where it searches every kind at once.",
    ),
  attribution: z
    .string()
    .nullable()
    .describe(
      "What to say when repeating what this archive contributed, as this archive states it for this answer. An archive whose licence asks for the date its metadata was retrieved carries that date here. Null on an archive that was never asked.",
    ),
  searches_on: z
    .string()
    .nullable()
    .describe(
      "The fields this archive matched the query against. The archives read different ones, so the same words are not the same question everywhere, and a name given to an index over titles alone comes back as the works written about that person.",
    ),
  row_describes: z
    .string()
    .nullable()
    .describe(
      "What one row from this archive is: a copy it holds, a record in a catalogue, or a work as an entity whose editions are records of their own. Rows carry the same fields and describe different kinds of thing.",
    ),
  filters_dropped: z
    .array(
      z.object({
        filter: z.string().describe("The narrowing, named as the argument that carries it."),
        because: z.string().describe("Why this archive never received it."),
      }),
    )
    .describe(
      "Narrowings you asked for that this archive never received, because its catalogue cannot apply them. Its rows were not narrowed by them, and a row from it that happens to satisfy one is a coincidence rather than a filter. Empty when it received every narrowing asked for.",
    ),
  queries: z
    .array(querySchema)
    .describe(
      "Every wording derived for this archive, in the order they were tried, with what each one returned and why any was withheld. Retyping one of them reproduces its rows by hand. Empty on a call that carries no query.",
    ),
  year_means: z
    .string()
    .nullable()
    .describe("What a 'year' on this archive's rows was measured on."),
  publishes_page_number: z
    .boolean()
    .nullable()
    .describe(
      "Whether this archive's full-text index holds a leaf number. False makes every 'page_number' from it null by nature.",
    ),
  corpus: z
    .string()
    .nullable()
    .describe(
      "What body of material this archive's full-text index reads. Null where this answer did not read it.",
    ),
  requires_every_word: z
    .boolean()
    .nullable()
    .describe(
      "Whether the index this answer put the words to answers only where every word given appears. It covers the words: a character that is neither a letter nor a digit is not a word to an index, and those are listed in 'non_word_characters' instead. False means the index ranks the words and answers with what it scores highest, so one of its rows can carry only some of them. Null on an archive that was not asked.",
    ),
  cached: z.boolean().describe("Served from this server's short-lived in-memory cache."),
  error: z
    .object({ code: z.string(), message: z.string(), hint: z.string().optional() })
    .nullable()
    .describe("Why this archive did not answer. Null when it did."),
});

/** Terms a record states, kept on the record and never summed for an answer. */
export const rightsSchema = z.object({
  statement: z
    .string()
    .nullable()
    .describe("What this record says about reuse, in the archive's own words."),
  url: z.string().nullable().describe("The licence this record points at, when it points at one."),
  covers: z
    .string()
    .nullable()
    .describe(
      "What the statement covers, where it covers more than this record. Null on an archive setting terms per deposit, where a statement covers the record it sits on and no other.",
    ),
  note: z
    .string()
    .describe("How to read the fields above for this record, including when they are null."),
});

export function toHitPayload(hit: Hit): z.infer<typeof hitSchema> {
  return {
    id: hit.id,
    source: hit.source,
    source_name: hit.sourceName,
    identifier: hit.identifier,
    title: hit.title,
    creator: hit.creator,
    year: hit.year,
    page_number: hit.pageNumber,
    excerpts: hit.excerpts,
    excerpt_kind: hit.excerptKind,
    source_url: hit.sourceUrl,
    matched_file: hit.matchedFile,
    inside_container: hit.insideContainer,
    published_on: hit.publishedOn,
    publication: hit.publication,
    found_by_query: hit.foundByQuery ?? null,
    found_by_derivation: hit.foundByDerivation ?? null,
  };
}

export function toRowPayload(row: ItemRow): z.infer<typeof rowSchema> {
  return {
    id: row.id,
    source: row.source,
    source_name: row.sourceName,
    identifier: row.identifier,
    title: row.title,
    creator: row.creator,
    year: row.year,
    date: row.date,
    media_type: row.mediaType,
    source_url: row.sourceUrl,
    downloads: row.downloads,
    location: row.location,
    online: row.online,
    identifier_provisional: row.identifierProvisional,
    found_by_query: row.foundByQuery ?? null,
    found_by_derivation: row.foundByDerivation ?? null,
  };
}

/**
 * What a report says once the archive's own profile is attached to it.
 *
 * A profile describes an archive from several angles, and each angle answers
 * one question. The angles a call did not ask about are left out here rather
 * than attached to every answer: which fields a catalogue matched is no part of
 * a search of scanned text, and what a corpus of scanned text holds is no part
 * of a catalogue answer.
 */
export interface ReportContext {
  yearMeans?: string;
  publishesPageNumber?: boolean;
  corpus?: string | null;
  searchesOn?: string;
  rowDescribes?: string;
  requiresEveryWord?: boolean | null;
}

export function toReportPayload(
  report: SourceReport,
  context: ReportContext = {},
): z.infer<typeof reportSchema> {
  return {
    source: report.source,
    name: report.name,
    status: report.status,
    stage: report.stage,
    absent_because: report.absentBecause,
    count: report.count,
    reported_total: report.reportedTotal,
    reported_total_means: report.reportedTotalMeans,
    skipped: report.skipped,
    more_on_this_archive: report.moreOnThisArchive,
    ordered_on: report.orderedOn,
    media_type_asked: report.mediaTypeAsked,
    attribution: report.attribution,
    searches_on: context.searchesOn ?? null,
    row_describes: context.rowDescribes ?? null,
    filters_dropped: report.filtersDropped.map((entry) => ({
      filter: entry.filter,
      because: entry.because,
    })),
    queries: report.queries.map((entry) => ({
      query: entry.query,
      derivation: entry.derivation,
      ran: entry.ran,
      count: entry.count,
      added: entry.added,
      not_run_because: entry.notRunBecause,
      error: entry.error,
    })),
    year_means: context.yearMeans ?? null,
    publishes_page_number: context.publishesPageNumber ?? null,
    corpus: context.corpus ?? null,
    requires_every_word: context.requiresEveryWord ?? null,
    cached: report.cached,
    error: report.error ?? null,
  };
}

/**
 * Turn the per-archive reports into sentences a reader can act on.
 *
 * A failed archive is named with the moment that failed, and an archive that
 * was never asked is named with the reason, so an answer holding part of what
 * was asked for never reads as the whole of what exists.
 */
export function reportNotes(reports: SourceReport[], page = 1): string[] {
  const notes: string[] = [];
  // Beyond the first page, an archive offering nothing has run out of rows
  // where the list stops rather than run out of rows altogether. Naming the
  // wording there sends a caller to rewrite a query that answered.
  const pastTheRows = page > 1;

  const answered = reports.filter((report) => report.status === "answered");
  const failed = reports.filter((report) => report.status === "failed");
  const absent = reports.filter((report) => report.status === "absent");

  for (const report of failed) {
    // What the rest of the answer holds depends on whether anything else
    // answered. Promising a caller that another archive made up the difference
    // when none did is the failure this whole shape exists to prevent.
    const consolation =
      answered.length > 0
        ? `This answer holds what the other archives found, and says nothing about what ${report.name} holds.`
        : "Nothing here is evidence about what it holds.";
    notes.push(
      `${report.name} was asked and its search did not answer (${report.error?.code}): ` +
        `${report.error?.message} ${consolation}`,
    );
  }

  for (const report of absent) {
    notes.push(
      `${report.name} was not asked for this. ${report.absentBecause} Nothing in this answer is evidence about what it holds.`,
    );
  }

  for (const report of answered) {
    if (report.count === 0 && report.skipped === 0) {
      // Where wordings were derived and sent, the shorter wording and the other
      // spelling have already been tried, and offering them as the next move
      // would send a caller after a search this answer already holds.
      notes.push(
        pastTheRows
          ? `${report.name} answered and returned no row on page ${page}. Its rows stop before this page, which says nothing about the wording or about what it holds: read page 1 for the rows it did return.`
          : report.queries.filter((entry) => entry.ran).length > 1
            ? `${report.name} answered and offered nothing under this wording, nor under any wording derived from it. That is a statement about those wordings as much as about the corpus.`
            : `${report.name} answered and offered nothing under this wording. That is a statement about ` +
              "the wording as much as about the corpus: try fewer words, or the spelling a scanner would " +
              "have produced.",
      );
    }
    if (report.count === 0 && report.skipped > 0) {
      // Every row it sent was unreadable, so this answer establishes nothing
      // about what the archive holds. Reading it as an absence would report a
      // failure of this server as a fact about the corpus.
      notes.push(
        `${report.name} answered, and every row it sent came back in a shape this server could not read. Nothing here is evidence about what it holds.`,
      );
    }
    if (report.skipped > 0) {
      notes.push(
        `${report.name} sent ${report.skipped} row(s) in a shape this server could not read, and they were left out. Its own count above still counts them.`,
      );
    }
    if (report.reportedTotal !== null && report.reportedTotalMeans !== null) {
      notes.push(`${report.name} reported ${report.reportedTotal}: ${report.reportedTotalMeans}.`);
    } else {
      notes.push(
        `${report.name} states no total, so a short list here is not evidence that little exists.`,
      );
    }
  }

  if (answered.length > 1) {
    notes.push(
      "Each count above counts something different, and they are never added together into one number.",
    );
  }

  // Which archive's rows were kept is what a reader checking one of them
  // against its own site needs, and an answer merging several archives holds
  // rows read a moment ago beside rows read once and kept.
  const fromCache = reports.filter((report) => report.cached).map((report) => report.name);
  if (fromCache.length > 0) {
    notes.push(
      `What ${fromCache.join(" and ")} contributed here was served out of an in-memory cache rather than read again.`,
    );
  }

  return notes;
}

/**
 * A character of the query that is no part of a word.
 *
 * Marks and punctuation are excluded: a mark belongs to the letter it sits on,
 * and punctuation is what separates words rather than something an index could
 * be expected to hold. What is left is a symbol, an emoji or a character that
 * renders as nothing.
 */
const NO_PART_OF_A_WORD = /[^\p{L}\p{N}\p{M}\p{P}\s]/gu;

/** The characters of a query that are neither letters nor digits, each once. */
export function nonWordCharacters(query: string): string[] {
  return [...new Set(query.match(NO_PART_OF_A_WORD) ?? [])];
}

/**
 * What such a character does to the promise that every word given appears.
 *
 * These indexes answer on words. None of them reports which characters it set
 * aside before looking, so an answer holding rows that carry none of these
 * establishes nothing about them either way, and a flag saying every word given
 * has to appear reads as a promise that they do. The characters are named with
 * their code points, since one of them can be invisible where this is read.
 */
export function nonWordCharactersNote(found: readonly string[]): string | null {
  if (found.length === 0) {
    return null;
  }
  const named = found.map((character) => `"${character}" (${codePointOf(character)})`).join(", ");
  const one = found.length === 1;
  return (
    `The query carries ${found.length} ${one ? "character that is" : "characters that are"} ` +
    `neither a letter nor a digit: ${named}. These indexes answer on words, and none of them says ` +
    `what it did with ${one ? "such a character" : "such characters"}, so a row here can carry ` +
    `${one ? "none of it" : "none of them"}: requires_every_word covers the words that were given.`
  );
}

/** A character named the way Unicode names it, for one that renders as nothing. */
function codePointOf(character: string): string {
  return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * What was actually sent, said in the answer rather than left in the payload.
 *
 * An answer built out of more than the words a caller wrote has to say so, and
 * has to say it in the block a client renders: a reader who cannot see which
 * wordings were sent cannot tell a corpus holding nothing from a wording
 * finding nothing, which is the confusion the whole derivation exists to lift.
 * Every wording here is one a reader can retype.
 */
export function queryNotes(reports: SourceReport[]): string[] {
  const notes: string[] = [];
  let unioned = false;

  for (const report of reports) {
    const sent = report.queries.filter((entry) => entry.ran);
    if (sent.length === 0) {
      continue;
    }

    const contributed = sent.slice(1).some((entry) => (entry.added ?? 0) > 0);
    const refused = sent.some((entry) => entry.error !== null);
    const emptyAsAsked = sent[0]?.count === 0;
    // An answer whose every row came from the words the caller wrote is the
    // answer to the question as put, and the wordings tried beside it changed
    // nothing a reader has to know to read it. They stay in 'queries', where a
    // caller checking how the answer was built will find them, rather than in
    // the block, where they would push out a sentence that does qualify it.
    if (!contributed && !refused && !emptyAsAsked) {
      continue;
    }
    if (contributed) {
      unioned = true;
    }

    // The words as asked open the line of every archive and open the block
    // above it, so they are named rather than quoted a third time. The derived
    // wordings are quoted, because they are the ones a reader has not seen and
    // would otherwise have no way to retype.
    const said = sent.map((entry, index) => {
      const words = index === 0 ? "as asked" : `"${entry.query}"`;
      return entry.error ? `${words}, did not answer` : `${words}, ${entry.count}`;
    });
    notes.push(
      `${report.name} was asked ${sent.length} quer${sent.length === 1 ? "y" : "ies"} and returned: ${said.join("; ")}.`,
    );
  }

  if (unioned) {
    notes.push(
      "A list built from more than one wording holds their union, deduplicated on the identifier this server hands out, in the order the wordings were sent. That is this server's own order over what it received, and no archive's judgement of relevance. 'queries' in per_source holds every wording, sent or withheld.",
    );
  }

  return notes;
}

/**
 * Words this server writes at the start of one of its own lines.
 *
 * A caller has no way to tell one of these from the same words inside a title,
 * a passage of scanned text or a licence written by whoever published it, so a
 * value opening with one is indented before it is rendered. Spacing and case
 * are allowed for, because a forged line only has to look like one of these to
 * a reader.
 */
const SERVER_MARKERS = /^(\s*)(Note|Sources?|Hint|Subjects|Held in|Copies|id)(\s*:)/gim;

/**
 * Keep text somebody else wrote out of the shape this server's own lines take.
 *
 * Applied to the foreign value rather than to the assembled block, because the
 * server writes those same words itself: indenting the whole block would indent
 * its own headings and leave the answer looking like quoted text.
 *
 * The structured output still carries the text exactly as it was published;
 * this is the rendered block only.
 */
export function indentMarkerLines(value: string): string {
  return value.replace(SERVER_MARKERS, ` $1$2${NO_BREAK_SPACE}$3`);
}

/**
 * What separates a word from its colon once a marker has been defused.
 *
 * The indent alone is read by a model, which sees this block as plain text, and
 * lost by a client that renders it as markdown, where up to three leading
 * spaces are stripped. Breaking the colon away from the word survives both, so
 * neither a model nor a reader sees a line in the shape the server writes.
 */
const NO_BREAK_SPACE = "\u00a0";

/**
 * Put a value somebody else wrote onto one of this server's own lines.
 *
 * Two things make that safe. A line terminator is turned into a space, because
 * a title or a passage carrying a newline can otherwise close the server's
 * sentence and open a whole section of its own: a forged list of matches, a
 * forged address, or a forged credit line. And an image is defused, because
 * most clients render this block as markdown and an image tag fetches its
 * address the moment it is drawn.
 *
 * Everything an archive or a caller wrote passes through here on its way into
 * the text block, including into the notes and the credit, which are the lines
 * a reader trusts most.
 */
export function quoteForeign(value: string): string {
  return (
    value
      // Every line terminator Unicode recognises, so a value can occupy one line
      // and no more.
      .replace(/[\r\n\u2028\u2029\u0085]+/g, " ")
      // Control characters, which render as nothing and hide what follows them.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      // Characters that reorder the text drawn around them, which lets a value
      // rearrange the server's own sentence without changing a word of it.
      .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
      // An image tag fetches its address on render; escaping the mark leaves the
      // text readable and the request unmade. A tag written as markup does the
      // same in a client that renders markup, so the angle bracket goes too.
      .replace(/!\[/g, "!\\[")
      .replace(/</g, "\\<")
      .replace(/\s{2,}/g, " ")
      .trim()
      // Now that it occupies one line, a value opening on one of the server's
      // own markers is the last way it could pass for a line the server wrote.
      .replace(SERVER_MARKERS, ` $1$2${NO_BREAK_SPACE}$3`)
  );
}

/**
 * Notes that have to survive when the block is too long for all of them.
 *
 * A note saying an archive failed or was never asked, a note carrying the terms
 * a record is published under, a note saying an excerpt is the opening of a
 * page rather than the match, and a note saying what a date order was built on
 * are the ones a reader most needs and the ones an over-long answer is most
 * likely to have. Dropping from the end alone would drop exactly these.
 */
const LOAD_BEARING =
  /did not answer|was not asked|was not given|could not be read|opening of (?:a|the) page|page_opening|no leaf number|optical recognition|no machine-read text|silence (?:is not|here is silence)|terms of reuse|licen[cs]e|https?:\/\/|never added together|offered nothing|none holds anything|read different material|different fields|provisional|Ask for page|Ask again with|reported \d|was asked \d+ quer|holds the union|no era|carr(?:y|ies) no year|ordered its own rows|returned no row on page|only some of|under a wording|never counted|titles alone|matched these words against|did not fit|neither a letter nor a digit|names media_type takes|description field/i;

/**
 * How much of the block the notes may take.
 *
 * What qualifies an answer grows with the number of archives in it: each one
 * states its own count, the fields its index read, the narrowings it never
 * received, what one of its rows is, and its own reason for being absent. The
 * room is therefore set against an answer merged from several archives rather
 * than against one archive's, and it is the rows that give way, since every row
 * is in the structured output with its identifier and its address while a
 * sentence qualifying the answer exists only here.
 */
const NOTE_BUDGET = 5200;

/**
 * Room the answer itself keeps, whatever its notes come to.
 *
 * Notes that qualify nothing are worth less than the answer, so the trailer
 * takes what it needs from the rows and stops here.
 */
const MIN_BODY_CHARS = 700;

/** What one block can come to, notes and rows together. */
export const MAX_BLOCK_CHARS = NOTE_BUDGET + MIN_BODY_CHARS;

/** Room for one note, so no single note can crowd out all the others. */
const MAX_NOTE_CHARS = 420;

export interface OkOptions {
  notes?: string[];
  /** The line that credits whoever published what the answer holds. */
  credit?: string;
}

/**
 * The notes the block will carry, and the trailer they make with the credit.
 *
 * What goes first is the last note that qualifies the answer least, so the ones
 * a reader cannot do without are still there when the room runs out. A note
 * that does qualify the answer goes only after every other has gone, and never
 * without the answer saying so: a warning silently absent is worse than no
 * warning at all, because a reader who cannot see that anything was cut has no
 * reason to look for it. The count and the place to read them therefore travel
 * in the trailer itself, and everything cut is in the structured output in full.
 */
function buildTrailer(options: OkOptions): string {
  const credit = options.credit ?? "No archive contributed to this answer.";
  // A note carrying an archive's own wording can run to any length, and one
  // long note would evict every other, including the ones a reader most needs.
  const kept = [...new Set((options.notes ?? []).map((note) => truncate(note, MAX_NOTE_CHARS)))];
  let cut = 0;

  const said = (): string[] =>
    cut === 0
      ? kept
      : [
          ...kept,
          `${cut} further note(s) qualifying this answer did not fit in this block and were left out of it. Every one of them is in 'notes' in the structured output, in full.`,
        ];

  while (kept.length > 0 && said().join("\n").length > NOTE_BUDGET) {
    // The last note that qualifies the answer least, and failing that the last
    // one there is: the room has run out either way, and what leaves is counted.
    let victim = kept.length - 1;
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (!LOAD_BEARING.test(kept[index] ?? "")) {
        victim = index;
        break;
      }
    }
    kept.splice(victim, 1);
    cut += 1;
  }

  // A note is assembled out of what an archive published: a title, a licence,
  // the wording of a failure. Any of those can carry a line terminator, and a
  // note that occupies two lines has written the server's second line itself.
  return [...said().map((note) => `Note: ${quoteForeign(note)}`), credit].join("\n");
}

/**
 * Build a result whose text block ends with its notes and its credit.
 *
 * The body is cut to fit around the trailer rather than the whole block being
 * cut afterwards. Appending the credit and then truncating loses exactly the
 * credit, which is the one line that must survive.
 *
 * Notes qualify an answer: that an archive failed, that an excerpt is the
 * opening of a page, that a count means one thing here and another there. A
 * client showing only the text would otherwise present an unqualified answer,
 * so they travel with the credit.
 */
export function ok(
  structured: Record<string, unknown>,
  body: string,
  options: OkOptions = {},
): ToolResult {
  const trailer = buildTrailer(options);
  const cut = "\n\n[shortened; the full result is in the structured output]";
  const room = roomFor(trailer);
  const text =
    body.length <= room
      ? `${body}\n\n${trailer}`
      : `${truncate(body, Math.max(0, room - cut.length))}${cut}\n\n${trailer}`;

  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * Errors carry no structured payload: the SDK checks it against the tool's
 * declared output schema, and a failure does not fit that shape.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof BooksError
      ? error
      : new BooksError("network_error", error instanceof Error ? error.message : String(error));

  // A message an archive's own reader wrote is bounded by nothing, and a
  // refusal is worth reading rather than scrolling.
  const lines = [`[${known.code}] ${truncate(quoteForeign(known.message), MAX_BODY_CHARS / 2)}`];
  if (known.details.hint) {
    lines.push(`Hint: ${truncate(quoteForeign(known.details.hint), MAX_BODY_CHARS / 4)}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

/**
 * How much room the answer itself has beside a trailer of a given length.
 *
 * The rows give way to the sentences that qualify them, down to a floor: an
 * answer that shows nothing at all is not an answer, however well qualified.
 * They give way no further than that, and the ceiling above holds however few
 * notes there are, so a short trailer never turns the block into a wall.
 */
function roomFor(trailer: string): number {
  return Math.min(MAX_BODY_CHARS, Math.max(MIN_BODY_CHARS, MAX_BODY_CHARS - trailer.length));
}

/**
 * How much room a body has once its notes and its credit are set aside.
 *
 * A tool rendering several things at once shares this out between them, so each
 * gets an opening rather than the first one filling the block and the rest
 * being cut away.
 */
export function roomForBody(options: OkOptions = {}): number {
  return Math.max(200, roomFor(buildTrailer(options)) - 60);
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const kept = text.slice(0, Math.max(0, maxChars - 1)).trimEnd();
  // A passage an archive already elided ends on this mark, and a second one
  // beside it reads as two cuts where there was one.
  return kept.endsWith("…") ? kept : `${kept}…`;
}

/**
 * The credit line, naming the archives that actually contributed to this
 * answer.
 *
 * An archive that failed, or that was never asked, has published nothing here
 * and crediting it would say it had.
 */
export function creditLine(contributors: Array<{ attribution: string; url?: string }>): string {
  if (contributors.length === 0) {
    return "No archive contributed to this answer.";
  }
  const names = contributors.map((entry) =>
    entry.url ? `${entry.attribution} — ${quoteForeign(entry.url)}` : entry.attribution,
  );
  return names.join("\n");
}
