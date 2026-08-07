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
import { strictInput } from "./arguments.js";
import { contextFor } from "./searchInside.js";
import {
  creditLine,
  ok,
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
  "Every count in 'per_source' is that archive's own and counts something of its own. They are never added together, and there is no total across archives.",
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
    .describe("Earliest year, in each archive's own reading of what a year is."),
  year_to: z
    .number()
    .int()
    .min(1000)
    .max(2100)
    .optional()
    .describe("Latest year, in each archive's own reading of what a year is."),
  sort: z
    .enum(SORT_VALUES)
    .default("relevance")
    .describe(
      "Applied inside each archive. The merged list stays interleaved, because no order runs across archives.",
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
  media_types: z
    .array(
      z.object({
        source: z.string(),
        name: z.string(),
        asked_with: z
          .string()
          .nullable()
          .describe("The name this archive was asked under. Null where it searches every kind."),
        vocabulary: z.array(z.string()).describe("Every name this archive files material under."),
      }),
    )
    .describe(
      "Which name each archive was asked under, published rather than reconciled, so a caller can map the vocabularies once and read what was actually searched.",
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
      },
      args.sources as readonly SourceId[] | undefined,
    );

    const items = merged.rows.map(toRowPayload);
    const notes = reportNotes(merged.reports);

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

    if (args.sort !== "relevance" && contributed.length > 1) {
      notes.push(
        `Each archive ordered its own rows: ${answered
          .filter((report) => report.orderedOn !== null)
          .map((report) => `${report.name} on ${report.orderedOn}`)
          .join("; ")}. The merged list interleaves them, so it is not in that order end to end.`,
      );
    }

    if ((args.year_from !== undefined || args.year_to !== undefined) && answered.length > 1) {
      notes.push(
        `The year range was applied inside each archive on its own reading of a year: ${answered
          .map(
            (report) =>
              `${report.name} on ${profiles.get(report.source)?.yearMeans ?? "a year it does not describe"}`,
          )
          .join("; ")}. Two rows sharing a year were not necessarily dated by the same measure.`,
      );
    }

    if (items.length > 0) {
      notes.push(
        "A catalogue row states no terms of reuse. Read a record with get_item for what that record itself says, and read a record stating nothing as a record that has granted nothing.",
      );
    }

    if (items.length === 0 && answered.length === merged.reports.length && answered.length > 0) {
      notes.push(
        "Every archive answered and none holds anything under this wording. Try fewer words, a creator's name, or a different kind of material.",
      );
    }

    const order =
      contributed.length > 1
        ? "One row from each archive in turn, in the order each archive returned them. No score orders them against each other and no date order spans them."
        : contributed.length === 1
          ? `Every row came from ${contributed[0]!.name}, in the order it returned them.`
          : "No archive contributed a row.";

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
          toReportPayload(report, contextFor(profiles.get(report.source))),
        ),
        media_types: mediaTypes,
        order,
        notes,
      },
      body,
      {
        notes,
        credit: creditLine(
          contributed.map((report) => ({ attribution: `Source: ${report.name}` })),
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
    // The address goes on its own line: a client that renders only text has
    // nothing else to cite from, and a model with an identifier and no link
    // will build one.
    return `${head}\n   id: ${quoteForeign(row.id)}\n   ${quoteForeign(row.source_url)}`;
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
