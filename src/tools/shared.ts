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
export const MAX_TEXT_CHARS = 3600;

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
    .nullable()
    .describe(
      "Rows this archive sent in a shape the server could not read, and left out. Null on an answer served from a cache that kept the rows and not the count of what was dropped building them.",
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
    .describe("What body of material this archive's full-text index reads."),
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
  };
}

/** What a report says once the archive's own profile is attached to it. */
export interface ReportContext {
  yearMeans?: string;
  publishesPageNumber?: boolean;
  corpus?: string | null;
  searchesOn?: string;
  rowDescribes?: string;
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
export function reportNotes(reports: SourceReport[]): string[] {
  const notes: string[] = [];

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
    if (report.count === 0 && (report.skipped ?? 0) === 0) {
      // Where wordings were derived and sent, the shorter wording and the other
      // spelling have already been tried, and offering them as the next move
      // would send a caller after a search this answer already holds.
      notes.push(
        report.queries.filter((entry) => entry.ran).length > 1
          ? `${report.name} answered and offered nothing under this wording, nor under any wording derived from it. That is a statement about those wordings as much as about the corpus.`
          : `${report.name} answered and offered nothing under this wording. That is a statement about ` +
              "the wording as much as about the corpus: try fewer words, or the spelling a scanner would " +
              "have produced.",
      );
    }
    if (report.count === 0 && (report.skipped ?? 0) > 0) {
      // Every row it sent was unreadable, so this answer establishes nothing
      // about what the archive holds. Reading it as an absence would report a
      // failure of this server as a fact about the corpus.
      notes.push(
        `${report.name} answered, and every row it sent came back in a shape this server could not read. Nothing here is evidence about what it holds.`,
      );
    }
    if ((report.skipped ?? 0) > 0) {
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

  if (reports.some((report) => report.cached)) {
    notes.push(
      "Part of this answer came from an in-memory cache rather than from the archive itself.",
    );
  }

  return notes;
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
    if (sent.length === 0) continue;

    const contributed = sent.slice(1).some((entry) => (entry.added ?? 0) > 0);
    const refused = sent.some((entry) => entry.error !== null);
    const emptyAsAsked = sent[0]!.count === 0;
    // An answer whose every row came from the words the caller wrote is the
    // answer to the question as put, and the wordings tried beside it changed
    // nothing a reader has to know to read it. They stay in 'queries', where a
    // caller checking how the answer was built will find them, rather than in
    // the block, where they would push out a sentence that does qualify it.
    if (!contributed && !refused && !emptyAsAsked) continue;
    if (contributed) unioned = true;

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
  /did not answer|was not asked|was not given|could not be read|opening of (?:a|the) page|page_opening|no leaf number|optical recognition|silence (?:is not|here is silence)|terms of reuse|licen[cs]e|https?:\/\/|never added together|offered nothing|none holds anything|read different material|different fields|provisional|Ask for page|Ask again with|reported \d|was asked \d+ quer|holds the union|no era|carr(?:y|ies) no year|ordered its own rows/i;

/**
 * How much of the block the notes may take.
 *
 * Enough for the sentences that qualify an answer, while leaving the answer
 * they qualify room to be one. What qualifies an answer grows with the number
 * of archives in it, since each one states its own count, its own order and its
 * own reason for being absent, so the share is set against a merged answer
 * rather than against a single archive's. Whatever is dropped is still in the
 * structured output, where a caller reading that instead loses nothing.
 */
const NOTE_BUDGET = Math.round(MAX_TEXT_CHARS * 0.55);

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
 * A long run of notes must not crowd out the answer it qualifies. What goes
 * first is the last note that qualifies the answer least, so the ones a reader
 * cannot do without are still there when the room runs out. Whatever is dropped
 * stays in the structured output.
 */
function buildTrailer(options: OkOptions): string {
  const credit = options.credit ?? "No archive contributed to this answer.";
  // A note carrying an archive's own wording can run to any length, and one
  // long note would evict every other, including the ones a reader most needs.
  const kept = [...new Set((options.notes ?? []).map((note) => truncate(note, MAX_NOTE_CHARS)))];

  while (kept.length > 0 && kept.join("\n").length > NOTE_BUDGET) {
    let victim = kept.length - 1;
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      if (!LOAD_BEARING.test(kept[index]!)) {
        victim = index;
        break;
      }
    }
    kept.splice(victim, 1);
  }

  // A note is assembled out of what an archive published: a title, a licence,
  // the wording of a failure. Any of those can carry a line terminator, and a
  // note that occupies two lines has written the server's second line itself.
  return [...kept.map((note) => `Note: ${quoteForeign(note)}`), credit].join("\n");
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
  const room = MAX_TEXT_CHARS - `\n\n${trailer}`.length;
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
  const lines = [`[${known.code}] ${truncate(quoteForeign(known.message), MAX_TEXT_CHARS / 2)}`];
  if (known.details.hint) {
    lines.push(`Hint: ${truncate(quoteForeign(known.details.hint), MAX_TEXT_CHARS / 4)}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

/**
 * How much room a body has once its notes and its credit are set aside.
 *
 * A tool rendering several things at once shares this out between them, so each
 * gets an opening rather than the first one filling the block and the rest
 * being cut away.
 */
export function roomForBody(options: OkOptions = {}): number {
  return Math.max(200, MAX_TEXT_CHARS - buildTrailer(options).length - 60);
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
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
  if (contributors.length === 0) return "No archive contributed to this answer.";
  const names = contributors.map((entry) =>
    entry.url ? `${entry.attribution} — ${quoteForeign(entry.url)}` : entry.attribution,
  );
  return names.join("\n");
}
