/**
 * search_items: the catalogue of every archive at once.
 *
 * `media_type` keeps one name across the archives and a vocabulary per archive,
 * because `texts` and `books` name different sets of things. The answer
 * publishes which name each archive was asked under, and an archive that files
 * nothing under the name given is named as absent rather than asked under a
 * translation that would search something else.
 */

import { z } from "zod";
import { MEDIA_TYPES, SORT_KEYS, SOURCE_IDS, SOURCE_PROFILES } from "../sources/client.js";
import type { BooksClient, SortKey } from "../sources/client.js";
import type { SourceId } from "../types.js";
import type { SourceProfile } from "../types.js";
import { strictInput } from "./arguments.js";
import {
  creditLine,
  nonWordCharacters,
  nonWordCharactersNote,
  ok,
  queryNotes,
  quoteForeign,
  reportNotes,
  reportSchema,
  roomForBody,
  rowSchema,
  toReportPayload,
  toRowPayload,
  toToolError,
} from "./shared.js";
import type { ToolResult } from "./shared.js";

const MEDIA_TYPE_VALUES = MEDIA_TYPES as unknown as [string, ...string[]];
const SORT_VALUES = SORT_KEYS as unknown as [SortKey, ...SortKey[]];
const SOURCE_VALUES = SOURCE_IDS as unknown as [string, ...string[]];

/** The orders that run on a date field rather than on a title or a score. */
const DATE_SORTS: ReadonlySet<SortKey> = new Set<SortKey>(["oldest", "newest"]);

/**
 * What a catalogue answer says about the archive that gave it.
 *
 * A profile describes an archive's catalogue and its full-text index both, and
 * only the catalogue was read here: the fields the words were matched against,
 * what one of its rows is, whether every word given had to appear, and what a
 * year on those rows was measured on. An archive that was never asked has
 * nothing attached, since what it reads when asked is no part of this answer.
 */
function catalogueContext(profile: SourceProfile | undefined, asked: boolean) {
  return profile && asked
    ? {
        yearMeans: profile.yearMeans,
        searchesOn: profile.searchesOn,
        rowDescribes: profile.rowDescribes,
        requiresEveryWord: profile.catalogueRequiresEveryWord,
      }
    : {};
}

/**
 * Which archive files material under which name, spelled out for a caller.
 *
 * Learning it from a failed call costs a round trip and several seconds of
 * pacing, and a caller who never reads the note takes a narrower answer for the
 * whole of what the server holds.
 */
const VOCABULARIES = SOURCE_PROFILES.map(
  (profile) => `${profile.name} files ${profile.mediaTypes.join(", ")}`,
).join("; ");

export const searchItemsDescription = [
  "Search the catalogue of every archive this server reads, at the same time, for a title, a creator or a subject, and get one merged list.",
  "Each row carries the id get_item takes, and that id names the archive it came from, so nothing has to be guessed afterwards.",
  "'media_type' keeps one name across the archives and a vocabulary per archive, because the same word does not name the same set of things twice. An archive that files nothing under the name you give is not asked and is named as absent, with its own names listed, rather than asked under a translation.",
  "An archive that keeps one catalogue per kind of material is asked for its default when you name none, and the answer says which catalogue that was.",
  "Rows are interleaved one archive at a time. No score orders them against each other, and 'sort' is applied inside each archive rather than across them: a year is the date of an edition in one place and the date on a catalogue record in another, so there is no date order that spans the answer.",
  "'oldest' and 'newest' order on a date field carrying a year and no era, so a date before the common era is filed there as a year of this one, and a record stating no date is placed by a stand-in rather than by its age. The first row of a date order is therefore not established as the oldest or newest thing an archive holds, the notes count the rows carrying no year, and this server orders nothing itself.",
  "Every count in 'per_source' is that archive's own and counts something of its own. They are never added together, and there is no total across archives.",
  "The catalogues read the words given in different ways, and 'per_source' says which each one does. One answers only where every word appears, so a question written as a sentence comes back empty; another scores the words and answers with the records it ranks highest, so a row of its can carry only some of them. Either way it is the words: a character that is neither a letter nor a digit is no word to an index, and 'non_word_characters' lists any the query carried.",
  "A name is also filed under more than one spelling, so further wordings are derived from the query and asked for their union. It costs nothing extra when the words as asked already answer. Every wording sent is named in 'per_source' with what it returned, every row carries the wording that returned it in 'found_by_query', and 'fan_out' turns the derivation off.",
  "A row's 'media_type' is the word that record carries for the kind of thing, which is often none of the names this argument takes: those are the divisions of a catalogue, and 'media_types' publishes them per archive.",
  "A row states no terms of reuse. Read the record with get_item for what that record itself says, and read silence as silence.",
  "Use search_inside for a phrase printed on a page: this tool reads catalogue records and knows nothing of what a book says, so a sentence given here matches only where a catalogue happens to carry it.",
  "Answers take several seconds, because one of the archives publishes a request ceiling this server keeps to.",
].join(" ");

export const searchItemsInput = strictInput({
  query: z.string().min(1).max(300).describe("A title, a creator, a subject, or plain words."),
  media_type: z
    .enum(MEDIA_TYPE_VALUES)
    .optional()
    .describe(
      `The kind of material, in the vocabulary of whichever archive uses that name. ${VOCABULARIES}. The names are the union of those vocabularies rather than a shared one, so an archive that does not use the name you give is named as absent rather than asked under another. Naming none leaves an archive that searches every kind unnarrowed and asks an archive that keeps one catalogue per kind for its own default.`,
    ),
  year_from: z
    .number()
    .int()
    .min(1000)
    .max(2100)
    .optional()
    .describe(
      "Earliest year, in each archive's own reading of what a year is. Given with 'year_to', it must not be the later of the two: a range running backwards names no year and is refused rather than read differently by each archive.",
    ),
  year_to: z
    .number()
    .int()
    .min(1000)
    .max(2100)
    .optional()
    .describe(
      "Latest year, in each archive's own reading of what a year is. It cannot be earlier than 'year_from'.",
    ),
  sort: z
    .enum(SORT_VALUES)
    .default("relevance")
    .describe(
      "Applied inside each archive. The merged list stays interleaved, because no order runs across archives. 'oldest' and 'newest' run on a date field carrying a year and no era, and a record stating no date is placed by a stand-in, so neither end of such an order is a claim about age.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(5)
    .describe("Rows to take from each archive, so one archive cannot fill the whole list."),
  page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(1)
    .describe("Which page of rows, from 1. Each archive is paged separately."),
  fan_out: z
    .boolean()
    .default(true)
    .describe(
      "Whether to derive further wordings from the query and ask each archive for the union of what they return. A question written as a sentence returns nothing where every word given has to appear, and the records an index scores highest where it does not, and a spelling of a name is not the only one a catalogue files it under. An archive is asked a derived wording only when the words as asked did not return as many rows as 'limit', so a query that works costs one request. Set false to send exactly the words given. 'per_source' names every wording, sent or not, and each row names the one that returned it.",
    ),
  sources: z
    .array(z.enum(SOURCE_VALUES))
    .optional()
    .describe(
      "Archives to ask, by id. Left out, they are all asked, which is the point of this tool.",
    ),
});

export const searchItemsOutput = z.object({
  query: z.string(),
  page: z.number().int(),
  items: z.array(rowSchema),
  item_count: z
    .number()
    .int()
    .describe("Rows in this answer, across every archive. Never a total of what exists."),
  per_source: z.array(reportSchema),
  queries_run: z
    .number()
    .int()
    .describe(
      "Requests this server sent for this answer, counting every wording on every archive. Each archive's own wordings are in 'per_source'.",
    ),
  media_types: z
    .array(
      z.object({
        source: z.string(),
        name: z.string(),
        asked_with: z
          .string()
          .nullable()
          .describe("The name this archive was asked under. Null where it searches every kind."),
        vocabulary: z
          .array(z.string())
          .describe(
            "Every name this archive takes as the 'media_type' argument, which is how its catalogue is divided. The 'media_type' on a row is the word that record carries, and is often none of these.",
          ),
      }),
    )
    .describe(
      "Which name each archive was asked under, published rather than reconciled, so a caller can map the vocabularies once and read what was actually searched.",
    ),
  non_word_characters: z
    .array(z.string())
    .describe(
      "Characters in the query that are neither letters nor digits. These catalogues answer on words, so a row here can carry none of them, and 'requires_every_word' covers the words that were given rather than these.",
    ),
  order: z.string().describe("How the list was built, in words."),
  notes: z.array(z.string()),
});

export type SearchItemsArgs = z.infer<typeof searchItemsInput>;

export async function runSearchItems(
  client: BooksClient,
  args: SearchItemsArgs,
): Promise<ToolResult> {
  try {
    const profiles = new Map(client.profiles.map((profile) => [profile.id, profile]));
    const merged = await client.searchItems(
      args.query,
      {
        ...(args.media_type === undefined ? {} : { mediaType: args.media_type }),
        ...(args.year_from === undefined ? {} : { yearFrom: args.year_from }),
        ...(args.year_to === undefined ? {} : { yearTo: args.year_to }),
        sort: args.sort,
        limit: args.limit,
        page: args.page,
        fanOut: args.fan_out,
      },
      args.sources as readonly SourceId[] | undefined,
    );

    const items = merged.rows.map(toRowPayload);
    const notes = [...queryNotes(merged.reports), ...reportNotes(merged.reports, args.page)];

    const answered = merged.reports.filter((report) => report.status === "answered");
    const contributed = merged.reports.filter((report) => report.count > 0);

    const mediaTypes = merged.reports
      .filter((report) => report.status !== "absent")
      .map((report) => ({
        source: report.source,
        name: report.name,
        asked_with: report.mediaTypeAsked,
        vocabulary: [...(profiles.get(report.source)?.mediaTypes ?? [])],
      }));

    // Naming no kind of material is a narrowing on an archive that keeps one
    // catalogue per kind, and a caller told nothing reads the answer as the
    // whole of what that archive holds.
    if (args.media_type === undefined) {
      for (const report of answered) {
        const profile = profiles.get(report.source);
        if (!profile || profile.defaultMediaType === null) continue;
        notes.push(
          `${report.name} keeps one catalogue per kind of material, so it was asked for "${profile.defaultMediaType}" and nothing else. Set media_type to read another of its catalogues: ${profile.mediaTypes.join(", ")}.`,
        );
      }
    }

    // A name two archives happen to spell the same way is still two names.
    // Reading one answer as though the word meant one thing is the mistake the
    // per-archive vocabulary exists to prevent.
    if (args.media_type !== undefined && answered.length > 1) {
      notes.push(
        `"${args.media_type}" is a name ${answered.map((report) => report.name).join(" and ")} both use, and each read it in its own vocabulary. It was passed through rather than translated, so the two answers are about the material each archive files under that word.`,
      );
    }

    // A date order runs on a field holding a year and nothing else, so two
    // things it cannot express decide where rows land. An era is absent, which
    // files a date before the common era as a year of this one. And a record
    // stating no date is given a stand-in at one end of the calendar, so it
    // sits where no date put it. Both make the first row of a date order
    // something other than the oldest or newest thing an archive holds, and a
    // caller reading it as chronology is reading a claim nobody made.
    if (DATE_SORTS.has(args.sort) && items.length > 0) {
      notes.push(
        `"${args.sort}" ordered each archive's own rows on a date field carrying a year and no era, so a date before the common era is filed there as a year of this one. A row can sit thousands of years from where its date belongs, and the first row is not established as the oldest or newest thing any archive holds. Read 'date' and the record itself before calling a row either.`,
      );

      const undated = items.filter((row) => row.year === null).length;
      if (undated > 0) {
        notes.push(
          `${undated} of the ${items.length} rows here ${undated === 1 ? "carries" : "carry"} no year. An archive ordering on a date files a row without one under a stand-in rather than by its age, so where such a row lands says nothing about when it was made.`,
        );
      }
    }

    if (args.sort !== "relevance" && contributed.length > 1) {
      notes.push(
        `Each archive ordered its own rows: ${answered
          .filter((report) => report.orderedOn !== null)
          .map((report) => `${report.name} on ${report.orderedOn}`)
          .join("; ")}. The merged list interleaves them, so it is not in that order end to end.`,
      );
    }

    // A narrowing an archive's catalogue cannot apply was never sent to it, and
    // an answer merging its rows with rows that were narrowed has to name it.
    // Otherwise the list reads as one where every row met the criterion.
    for (const report of merged.reports) {
      for (const dropped of report.filtersDropped) {
        notes.push(
          `${report.name} was not given the ${dropped.filter === "year_range" ? "year range" : `"${args.sort}" order`} asked for. ${dropped.because} Its rows are here unnarrowed by it, so one of them satisfying it does so by chance rather than because it was filtered.`,
        );
      }
    }

    // The archives that received the range are the only ones it can be said of.
    const withRange = answered.filter(
      (report) => !report.filtersDropped.some((dropped) => dropped.filter === "year_range"),
    );
    if ((args.year_from !== undefined || args.year_to !== undefined) && withRange.length > 1) {
      notes.push(
        `The year range was applied inside each of ${withRange
          .map(
            (report) =>
              `${report.name}, on ${profiles.get(report.source)?.yearMeans ?? "a year it does not describe"}`,
          )
          .join("; ")}. Two rows sharing a year were not necessarily dated by the same measure.`,
      );
    }

    // The same words put to two catalogues are two questions when one reads the
    // whole record and another reads a title. A caller who takes them for one
    // question reads an archive's silence as a corpus holding nothing, when it
    // holds the thing under a field that was never searched.
    const fields = answered.map((report) => ({
      name: report.name,
      on: profiles.get(report.source)?.searchesOn ?? null,
    }));
    const stated = fields.filter(
      (entry): entry is { name: string; on: string } => entry.on !== null,
    );
    if (stated.length > 1 && new Set(stated.map((entry) => entry.on)).size > 1) {
      notes.push(
        `The archives matched these words against different fields: ${stated
          .map((entry) => `${entry.name} on ${entry.on}`)
          .join("; ")}.`,
      );
    }

    // What follows from a narrow index is said whenever that archive answered,
    // and not only where another archive stood beside it to make the contrast
    // visible. An answer built entirely from such an index is the one where a
    // reader is least able to see what was and was not searched.
    for (const report of answered) {
      const caveat = profiles.get(report.source)?.searchesOnCaveat;
      if (caveat) notes.push(`${report.name} ${caveat}`);
    }

    // A catalogue that scores the words rather than requiring them all answers
    // a long query with the records it ranks highest, so a row can carry some
    // of the words and none of the rest.
    for (const report of contributed) {
      if (profiles.get(report.source)?.catalogueRequiresEveryWord !== false) continue;
      notes.push(
        `${report.name} does not require every word given to appear: it scores them and answers with the records it ranks highest, so a row of its here can carry only some of them.`,
      );
    }

    // A catalogue that does require every word given requires every word, and
    // a character that is no word to it falls outside that promise.
    const outsideTheWords = nonWordCharacters(args.query);
    const outsideNote = nonWordCharactersNote(outsideTheWords);
    if (outsideNote) notes.push(outsideNote);

    // The word a record carries for the kind of thing and the names this
    // argument takes are two vocabularies. A caller holding one answer sees
    // both, and reads the first as though it belonged to the second.
    for (const report of contributed) {
      const vocabulary = profiles.get(report.source)?.mediaTypes ?? [];
      const carried = [
        ...new Set(
          items
            .filter((row) => row.source === report.source)
            .map((row) => row.media_type)
            .filter((word) => word !== null)
            .filter((word) => !vocabulary.includes(word)),
        ),
      ];
      if (carried.length === 0) continue;
      notes.push(
        `${report.name} answered with rows whose own word for the kind of thing is not one of the names media_type takes: ${carried.map((word) => `"${quoteForeign(word)}"`).join(", ")}. A row carries the word its record carries, and 'media_types' lists the names this archive's catalogue is divided under.`,
      );
    }

    const provisional = items.filter((row) => row.identifier_provisional === true).length;
    if (provisional > 0) {
      notes.push(
        `${provisional} of the ${items.length} rows here ${provisional === 1 ? "carries an identifier its archive calls" : "carry identifiers their archive calls"} provisional: it is held while a cataloguer settles the record and can change, so prefer a settled identifier when citing one.`,
      );
    }

    if (items.length > 0) {
      notes.push(
        "A catalogue row states no terms of reuse. Read a record with get_item for what that record itself says, and read a record stating nothing as a record that has granted nothing.",
      );
    }

    if (items.length === 0 && answered.length === merged.reports.length && answered.length > 0) {
      // An archive that dropped rows it could not read, or that counted matches
      // it then described in a shape this server could not decode, has not said
      // its catalogue holds nothing. Calling that an absence reports a failure
      // of this server as a fact about a corpus, and pointing the caller at
      // their own wording sends them to rewrite a question that was answered.
      const contradicted = answered.flatMap((report) =>
        report.skipped > 0
          ? [`${report.name} sent ${report.skipped} row(s) this server could not read`]
          : (report.reportedTotal ?? 0) > 0
            ? [`${report.name} counted ${report.reportedTotal} match(es) and returned none of them`]
            : [],
      );

      // An empty page beyond the first is where the rows stop, which is a fact
      // about how far the list runs. Reading it as an empty catalogue would
      // send a caller to rewrite a query that answered on page one.
      //
      // It opens the notes rather than closing them: on an answer holding no
      // rows this sentence is the answer, and a block with room for only some
      // of its notes drops from the end.
      notes.unshift(
        args.page > 1
          ? `Every archive answered and none returned a row on page ${args.page}. Their rows stop before it, so this says nothing about the wording: read an earlier page for what they did return.`
          : contradicted.length > 0
            ? `Every archive answered and no row reached this list, which is not the same as none holding anything: ${contradicted.join("; ")}. Nothing here is evidence about what they hold, and the wording is not what to change.`
            : "Every archive answered and none holds anything under this wording. Try fewer words, a creator's name, or a different kind of material.",
      );
    }

    const order = [
      contributed.length > 1
        ? "One row from each archive in turn, in the order each archive returned them. No score orders them against each other and no date order spans them."
        : contributed.length === 1
          ? `Every row came from ${contributed[0]?.name}, in the order it returned them.`
          : "No archive contributed a row.",
      merged.reports.some((report) => report.queries.filter((entry) => entry.ran).length > 1)
        ? "An archive asked more than one wording has its rows in the order those wordings were sent, which is this server's own order over what it received and no archive's judgement of relevance."
        : "",
    ]
      .filter((part) => part !== "")
      .join(" ");

    const queriesRun = merged.reports.reduce(
      (total, report) => total + report.queries.filter((entry) => entry.ran).length,
      0,
    );

    const body =
      items.length > 0
        ? renderRows(items, args.query, notes)
        : answered.length === 0
          ? `No archive answered for ${quoteForeign(args.query)}, so nothing here says whether such a record exists.`
          : `Nothing came back for ${quoteForeign(args.query)}.`;

    return ok(
      {
        query: args.query,
        page: args.page,
        items,
        item_count: items.length,
        per_source: merged.reports.map((report) =>
          toReportPayload(
            report,
            catalogueContext(profiles.get(report.source), report.status !== "absent"),
          ),
        ),
        queries_run: queriesRun,
        media_types: mediaTypes,
        non_word_characters: outsideTheWords,
        order,
        notes,
      },
      body,
      {
        notes,
        // Each archive's own credit, as that archive states it: one publishing
        // on a condition carries the condition's date here, and two credits are
        // never folded into one sentence about the answer.
        credit: creditLine(
          contributed.map((report) => ({
            attribution: report.attribution ?? `Source: ${report.name}`,
          })),
        ),
      },
    );
  } catch (error) {
    return toToolError(error);
  }
}

/** A compact listing, carrying what it takes to pick one record out of many. */
function renderRows(
  rows: Array<z.infer<typeof rowSchema>>,
  query: string,
  notes: string[],
): string {
  const blocks = rows.map((row, index) => {
    const head = [
      `${index + 1}. ${quoteForeign(row.title ?? row.identifier)}`,
      row.year === null ? "" : `(${row.year})`,
      row.creator ? `· ${quoteForeign(row.creator)}` : "",
      `· ${quoteForeign(row.source_name)}`,
      row.media_type ? `· ${quoteForeign(row.media_type)}` : "",
      row.online === false ? "· no copy online" : "",
    ]
      .filter(Boolean)
      .join(" ");
    // A row a derived wording returned answers that wording's words rather than
    // the question as written, and the head of the block names the question.
    const under =
      row.found_by_query !== null && row.found_by_query !== query
        ? `\n   found under: ${quoteForeign(row.found_by_query)}`
        : "";
    // The address goes on its own line: a client that renders only text has
    // nothing else to cite from, and a model with an identifier and no link
    // will build one.
    return `${head}${under}\n   id: ${quoteForeign(row.id)}\n   ${quoteForeign(row.source_url)}`;
  });

  // Whole rows are dropped rather than the block being cut where the room runs
  // out. A cut lands mid-row and takes the identifier and the address with it,
  // leaving a title a reader can neither open nor cite.
  const room = roomForBody({ notes });
  const head = `${rows.length} records for ${quoteForeign(query)}:`;
  const kept = [...blocks];
  const withheld = () =>
    `(${rows.length - kept.length} further row(s) are in the structured output.)`;
  while (kept.length > 1 && [head, ...kept, withheld()].join("\n").length > room) {
    kept.pop();
  }

  return [head, ...kept, ...(kept.length < rows.length ? [withheld()] : [])].join("\n");
}
