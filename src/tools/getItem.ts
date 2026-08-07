/**
 * get_item: one record, from the archive its identifier names.
 *
 * Only that archive is called. Trying another after a miss would answer a
 * question about one collection with somebody else's record under a different
 * name.
 *
 * Terms of reuse come back on every read, whatever sections were asked for.
 * They belong to the record and to nothing larger: one record under a licence
 * and one stating nothing do not add up to a sentence about an answer, and a
 * record stating nothing has granted nothing.
 */

import { z } from "zod";
import type { BooksClient } from "../sources/client.js";
import { strictInput } from "./arguments.js";
import { creditLine, ok, quoteForeign, rightsSchema, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";

/** Parts of a record a caller opts into. A full record is a lot of text. */
export const SECTIONS = ["description", "subjects", "copies", "context"] as const;
export type Section = (typeof SECTIONS)[number];

export const getItemDescription = [
  "Read one record in full from the archive its identifier names: what it is, who made it, when, what the archive says about it, and what a reader can open.",
  "'identifier' must come from search_inside or search_items. It names the archive, so this reads the right one without guessing; a string no archive would have minted is refused, and a shape more than one archive mints is refused rather than sent to a guess, because sending it anywhere answers about the wrong thing.",
  "Terms of reuse come back on every read and belong to that record alone. A record stating none has granted nothing, and silence is never read as permission.",
  "'sections' decides what else comes back, and the answer names what was left out and what this archive files nothing under: a field empty because nobody asked for it is a different thing from a field the archive never fills.",
  "Long prose is returned one window at a time: 'text_offset' says where to resume, and a window ends at a line boundary. An offset past the end says so rather than answering with an empty description.",
  "An answer can take several seconds, because one of the archives publishes a request ceiling this server keeps to.",
].join(" ");

export const getItemInput = strictInput({
  identifier: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "From a search, such as 'archive:mobydickorwhale01melv' or 'loc:sn83030214/1900-01-01/ed-1/seq-1'.",
    ),
  sections: z
    .array(z.enum(SECTIONS))
    .default(["description"])
    .describe("Which parts to return besides the record's identity and its terms of reuse."),
  max_copies: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Copies to list. The answer says how many more the record holds."),
  text_offset: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(0)
    .describe("Where to resume in the record's prose, in characters from its start."),
  max_text_chars: z
    .number()
    .int()
    .min(200)
    .max(8000)
    .default(1500)
    .describe(
      "Characters of prose to return. The text block shows roughly the first 1400 of them and the whole window is in the structured output. The answer says where to resume.",
    ),
});

export const getItemOutput = z.object({
  item: z.object({
    id: z.string(),
    source: z.string(),
    source_name: z.string(),
    identifier: z.string(),
    title: z.string().nullable(),
    creator: z.string().nullable(),
    year: z
      .number()
      .int()
      .nullable()
      .describe("What this archive calls a year. 'year_means' says what it was measured on."),
    year_means: z.string(),
    date: z.string().nullable().describe("The date exactly as published."),
    media_type: z.string().nullable(),
    source_url: z.string(),
    attribution: z.string(),
    description: z
      .string()
      .nullable()
      .describe("The window of the record's own prose that 'text_window' describes."),
    notes: z
      .array(z.string())
      .describe(
        "Further prose the archive files apart from the description. Empty on an archive that files none, which 'fields_not_read_from_this_archive' names.",
      ),
    subjects: z.array(z.string()),
    rights: rightsSchema,
    copies: z.array(
      z.object({
        label: z.string().nullable().describe("Null where the archive names the copy nothing."),
        format: z
          .string()
          .nullable()
          .describe("Null on an archive that states no format for a served copy."),
        url: z.string().nullable(),
      }),
    ),
    copies_available: z
      .number()
      .int()
      .describe(
        "Copies this server read off the record, before 'max_copies' was applied. It counts what a reader can open, so it is smaller than the archive's own file count wherever that count includes the archive's bookkeeping.",
      ),
    generated_entries: z
      .number()
      .int()
      .describe(
        "Entries the archive lists against this record that are its own bookkeeping or the by-products of its processing rather than copies of the thing. They were left out of 'copies' and are on the archive's own page.",
      ),
    context: z.array(z.string()).describe("Collections, divisions and shelves the record sits in."),
  }),
  id_read_as: z
    .string()
    .nullable()
    .describe("How a raw identifier was routed, when it was not spelled with its archive."),
  sections_returned: z.array(z.string()),
  sections_omitted: z
    .array(z.string())
    .describe(
      "Sections this call did not ask for. A field belonging to one of these is empty for that reason alone.",
    ),
  fields_not_read_from_this_archive: z
    .array(z.string())
    .describe(
      "Fields this server reads nothing into from this archive. A field named here is empty for every record it returns, which is a different thing from a record that left it blank.",
    ),
  text_window: z
    .object({
      offset: z.number().int(),
      returned_chars: z.number().int(),
      total_chars: z.number().int(),
      next_offset: z
        .number()
        .int()
        .nullable()
        .describe("Where to resume. Null when the prose ended here."),
    })
    .describe("Which part of the record's prose this answer carries."),
  notes: z.array(z.string()),
});

export type GetItemArgs = z.infer<typeof getItemInput>;

export async function runGetItem(client: BooksClient, args: GetItemArgs): Promise<ToolResult> {
  try {
    const { item, cached, read } = await client.getItem(args.identifier);
    const profile = client.profiles.find((entry) => entry.id === item.source);
    const yearMeans = profile?.yearMeans ?? "measured on something this archive does not describe";
    const sections = args.sections as readonly Section[];
    const wanted = new Set<Section>(sections);
    const omitted = SECTIONS.filter((section) => !wanted.has(section));
    const notes: string[] = [];

    if (read.inferred) {
      notes.unshift(
        `"${quoteForeign(args.identifier)}" was read as ${read.source.name}'s, because ${read.inferred}. ` +
          "Spell an identifier with its archive to leave nothing to infer.",
      );
    }

    const prose = wanted.has("description") ? (item.description ?? "") : "";
    const window = pageProse(prose, args.text_offset, args.max_text_chars);
    if (wanted.has("description") && window.pastEnd) {
      notes.push(
        `text_offset ${args.text_offset} is past the end of this record's prose, which runs to ${window.totalChars} characters. Ask again from 0 rather than reading this as a record with nothing written about it.`,
      );
    }
    if (window.nextOffset !== null) {
      notes.push(
        `The prose runs to ${window.totalChars} characters and ${window.returnedChars} are here. Ask again with text_offset ${window.nextOffset} to continue.`,
      );
    }

    const copies = wanted.has("copies") ? item.copies.slice(0, args.max_copies) : [];
    if (wanted.has("copies") && item.copiesAvailable > copies.length) {
      notes.push(
        `${item.copiesAvailable} copies were read off this record and ${copies.length} are here. Raise max_copies to see more of them.`,
      );
    }
    if (wanted.has("copies") && item.generatedEntries > 0) {
      // The archive's own page lists these, so a reader counting there and
      // counting here would otherwise find two numbers and no reason for them.
      notes.push(
        `${item.sourceName} lists ${item.generatedEntries} further ${item.generatedEntries === 1 ? "entry" : "entries"} against this record that are its own bookkeeping or the by-products of its processing rather than copies of the thing, and they are left out. They are on the record's own page.`,
      );
    }

    notes.push(rightsNote(item.rights, item.sourceName));

    if (item.unreadFields.length > 0) {
      notes.push(
        `This server reads nothing into ${item.unreadFields.join(" or ")} from ${item.sourceName}, so an empty field there is empty for every record it returns rather than for this one.`,
      );
    }
    if (omitted.length > 0) {
      notes.push(
        `${omitted.join(", ")} ${omitted.length === 1 ? "was" : "were"} not asked for, so ${omitted.length === 1 ? "it is" : "they are"} empty here for that reason alone.`,
      );
    }
    notes.push(`A year on ${item.sourceName} is ${yearMeans}.`);
    if (cached) notes.push("Served from an in-memory cache rather than from the archive itself.");

    const payload = {
      id: item.id,
      source: item.source,
      source_name: item.sourceName,
      identifier: item.identifier,
      title: item.title,
      creator: item.creator,
      year: item.year,
      year_means: yearMeans,
      date: item.date,
      media_type: item.mediaType,
      source_url: item.sourceUrl,
      attribution: item.attribution,
      description: wanted.has("description") ? (window.text === "" ? null : window.text) : null,
      notes: wanted.has("description") ? item.notes : [],
      subjects: wanted.has("subjects") ? item.subjects : [],
      rights: {
        statement: item.rights.statement,
        url: item.rights.url,
        note: rightsNote(item.rights, item.sourceName),
      },
      copies,
      copies_available: item.copiesAvailable,
      generated_entries: item.generatedEntries,
      context: wanted.has("context") ? item.context : [],
    };

    const lines = [
      `${quoteForeign(payload.title ?? payload.identifier)} · ${quoteForeign(payload.source_name)}`,
      quoteForeign(payload.source_url),
      [
        payload.creator ? quoteForeign(payload.creator) : "",
        payload.date
          ? quoteForeign(payload.date)
          : payload.year === null
            ? ""
            : String(payload.year),
        payload.media_type ? quoteForeign(payload.media_type) : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ].filter((line) => line !== "");

    if (payload.description) {
      lines.push("", truncate(quoteForeign(payload.description), 1400));
    }
    if (payload.notes.length > 0) {
      lines.push("", ...payload.notes.map((note) => quoteForeign(note)));
    }
    if (payload.subjects.length > 0) {
      lines.push("", `Subjects: ${payload.subjects.map(quoteForeign).join(", ")}`);
    }
    if (payload.context.length > 0) {
      lines.push("", `Held in: ${payload.context.map(quoteForeign).join(", ")}`);
    }
    if (copies.length > 0) {
      lines.push(
        "",
        "Copies:",
        ...copies.map(
          (copy) =>
            `- ${quoteForeign(copy.label ?? copy.url ?? "a copy this archive names nothing")}${copy.url && copy.label ? `: ${quoteForeign(copy.url)}` : ""}`,
        ),
      );
    }

    return ok(
      {
        item: payload,
        id_read_as: read.inferred,
        sections_returned: [...sections],
        sections_omitted: omitted,
        fields_not_read_from_this_archive: item.unreadFields,
        text_window: {
          offset: args.text_offset,
          returned_chars: window.returnedChars,
          total_chars: window.totalChars,
          next_offset: window.nextOffset,
        },
        notes,
      },
      lines.join("\n"),
      {
        notes,
        credit: creditLine([{ attribution: item.attribution, url: item.sourceUrl }]),
      },
    );
  } catch (error) {
    return toToolError(error);
  }
}

/**
 * A window of prose, resumed at a line boundary.
 *
 * Cutting on a character puts a reader mid-word and invites them to complete
 * it. The window is pulled back to the last line break it contains, and to the
 * last space when the paragraph is longer than the whole window.
 */
export function pageProse(
  prose: string,
  offset: number,
  maxChars: number,
): {
  text: string;
  totalChars: number;
  returnedChars: number;
  nextOffset: number | null;
  pastEnd: boolean;
} {
  const totalChars = prose.length;
  if (totalChars === 0) {
    return { text: "", totalChars: 0, returnedChars: 0, nextOffset: null, pastEnd: false };
  }
  if (offset >= totalChars) {
    return { text: "", totalChars, returnedChars: 0, nextOffset: null, pastEnd: true };
  }

  const end = Math.min(totalChars, offset + maxChars);
  let cut = end;
  if (end < totalChars) {
    const slice = prose.slice(offset, end);
    const line = slice.lastIndexOf("\n");
    const space = slice.lastIndexOf(" ");
    const boundary = line > maxChars / 2 ? line : space > maxChars / 2 ? space : slice.length;
    cut = offset + boundary;
  }

  const text = prose.slice(offset, cut).trim();
  return {
    text,
    totalChars,
    // What the answer carries, so a caller adding it up never overshoots the
    // length the same answer reported for the whole of the prose.
    returnedChars: text.length,
    nextOffset: cut < totalChars ? cut : null,
    pastEnd: false,
  };
}

/**
 * What one record says about reuse, said about that record and nothing wider.
 *
 * A record stating nothing is the ordinary case in both archives, and it is
 * the case a reader is most likely to misread: an archive publishing a scan has
 * not thereby granted anything, and terms vary per deposit.
 */
export function rightsNote(
  rights: { statement: string | null; url: string | null },
  sourceName: string,
): string {
  if (rights.statement && rights.url) {
    return `This record states its own terms: ${rights.statement} (${rights.url}). They cover this record and no other.`;
  }
  if (rights.statement) {
    return `This record states its own terms: ${rights.statement}. They cover this record and no other.`;
  }
  if (rights.url) {
    return `This record points at ${rights.url} for its terms. They cover this record and no other.`;
  }
  return `This record states no terms of reuse. ${sourceName} sets terms per deposit, so silence here is silence: it is not a grant, and it says nothing about any other record.`;
}
