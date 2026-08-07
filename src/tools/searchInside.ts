/**
 * search_inside: a phrase in the text itself, across every archive that holds
 * machine-read text.
 *
 * This is the question no catalogue can answer, and the one that justifies
 * reading several archives at once. The corpora behind it are different bodies
 * of material: digitised books and documents in one, the pages of newspapers in
 * another. Asking them all asks where a phrase was ever printed, so the answer
 * is those corpora put together rather than several answers to one question,
 * and it says so.
 */

import { z } from "zod";
import type { BooksClient } from "../sources/client.js";
import type { SourceId, SourceProfile } from "../types.js";
import { SOURCE_IDS } from "../sources/registry.js";
import { strictInput } from "./arguments.js";
import {
  OCR_CAVEAT,
  creditLine,
  hitSchema,
  ok,
  quoteForeign,
  reportNotes,
  reportSchema,
  roomForBody,
  toHitPayload,
  toReportPayload,
  toToolError,
  truncate,
} from "./shared.js";
import type { ToolResult } from "./shared.js";

const SOURCE_VALUES = SOURCE_IDS as unknown as [string, ...string[]];

/** The last page this tool will fetch, matching the ceiling on `page`. */
const LAST_PAGE = 100;

export const searchInsideDescription = [
  "Search the machine-read text of every archive this server reads that holds any, at the same time, and get one list of where a phrase was printed.",
  "The archives behind this tool hold different material, so the list is additive: it is the places a phrase appears in each corpus, put together, rather than the same question answered twice. 'per_source' names what each corpus is.",
  "A match carries 'page_number', which is a real leaf on an archive whose index holds one and null on an archive whose index holds none. That null is the index having no leaf, never a page this server dropped, and no page is ever invented.",
  "A match also carries 'excerpt_kind'. 'passage' is the text around the words that matched. 'page_opening' is the start of the page, sent because the machine-read text that came back stops before the searched words appear, so it does not carry the match. The notes say how many excerpts are openings.",
  "Every count is that archive's own and counts something of its own: documents in one place, leaves in another. They are never added together, and there is no total across archives.",
  "Rows are interleaved one archive at a time. Nothing ranks them against each other and nothing orders them by date, because a year is measured on different things in each archive.",
  "Use search_items for a work by its title, its creator or its subject: this tool reads the text on the pages and knows nothing of a catalogue, so a title given here finds every book that happens to mention it and misses the book itself.",
  "Answers take several seconds, because one of the archives publishes a request ceiling this server keeps to. A slow answer is the pacing, not a stall.",
].join(" ");

export const searchInsideInput = strictInput({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe("Words, or a phrase in double quotes such as '\"call me ishmael\"'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(3)
    .describe(
      "Matches to take from each archive, so one archive cannot fill the whole list. The text block shows about six matches; the rest of what comes back is in the structured output.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(1)
    .describe("Which page of matches, from 1. Each archive is paged separately."),
  max_excerpt_chars: z
    .number()
    .int()
    .min(80)
    .max(1200)
    .default(300)
    .describe(
      "Budget for one passage. Read it together with 'max_excerpts_per_match': the size of the answer is the product of the two, the limit, and the number of archives.",
    ),
  max_excerpts_per_match: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(2)
    .describe(
      "Passages to keep per match. A long work matches in several places, and the later ones rarely say anything the first did not.",
    ),
  sources: z
    .array(z.enum(SOURCE_VALUES))
    .optional()
    .describe(
      "Archives to ask, by id. Left out, every archive that reads machine-read text is asked, which is the point of this tool.",
    ),
});

export const searchInsideOutput = z.object({
  query: z.string(),
  page: z.number().int(),
  hits: z.array(hitSchema),
  hit_count: z
    .number()
    .int()
    .describe(
      "Matches in this answer, across every archive. It is a count of what came back, never a total of what exists.",
    ),
  per_source: z.array(reportSchema),
  order: z.string().describe("How the list was built, in words."),
  excerpt_kinds: z
    .object({
      passage: z.number().int().describe("Excerpts that carry the words that matched."),
      page_opening: z
        .number()
        .int()
        .describe("Excerpts that are the opening of a page and do not carry the match."),
    })
    .describe("How many excerpts here are of each kind."),
  notes: z.array(z.string()),
});

export type SearchInsideArgs = z.infer<typeof searchInsideInput>;

export async function runSearchInside(
  client: BooksClient,
  args: SearchInsideArgs,
): Promise<ToolResult> {
  try {
    const profiles = new Map(client.profiles.map((profile) => [profile.id, profile]));
    const merged = await client.searchInside(
      args.query,
      {
        limit: args.limit,
        page: args.page,
        maxExcerptChars: args.max_excerpt_chars,
        maxExcerptsPerMatch: args.max_excerpts_per_match,
      },
      args.sources as readonly SourceId[] | undefined,
    );

    const hits = merged.hits.map(toHitPayload);
    const notes = reportNotes(merged.reports);

    const answered = merged.reports.filter((report) => report.status === "answered");
    const contributed = merged.reports.filter((report) => report.count > 0);

    // The corpora themselves are named in 'per_source', so this says only what
    // follows from their being different, which is what a merged list invites a
    // reader to forget.
    const withCorpus = answered.filter((report) => profiles.get(report.source)?.insideCorpus);
    if (withCorpus.length > 1) {
      notes.push(
        `${withCorpus.map((report) => report.name).join(" and ")} read different material, and 'per_source' says what each one reads. The list here is those corpora put together, so a match from one says nothing about what the others hold.`,
      );
    }

    const excerptKinds = {
      passage: hits
        .filter((hit) => hit.excerpt_kind === "passage")
        .reduce((total, hit) => total + hit.excerpts.length, 0),
      page_opening: hits
        .filter((hit) => hit.excerpt_kind === "page_opening")
        .reduce((total, hit) => total + hit.excerpts.length, 0),
    };

    if (excerptKinds.page_opening > 0) {
      const matches = hits.filter((hit) => hit.excerpt_kind === "page_opening").length;
      const total = excerptKinds.passage + excerptKinds.page_opening;
      notes.push(
        `${excerptKinds.page_opening} of the ${total} excerpts here ${excerptKinds.page_opening === 1 ? "is" : "are"} the opening of a page rather than the passage that matched, across ${matches} ${matches === 1 ? "match" : "matches"}. The searched words sit further down those pages than the text this server received, so quoting one of them does not quote the match: follow source_url to read the page.`,
      );
    }

    // A null page number means two different things on two archives, and the
    // difference is only readable when the answer states which is which.
    for (const report of answered) {
      const profile = profiles.get(report.source);
      if (!profile || profile.publishesPageNumber || report.count === 0) continue;
      notes.push(
        `${report.name} publishes no leaf number in its full-text index, so page_number is null on all ${report.count} of its matches here. That is the index holding none, and no page is invented in its place.`,
      );
    }

    if (hits.some((hit) => hit.inside_container)) {
      notes.push(
        "Some matches sit inside a document bundled in a larger record. On those the title, creator and year describe the container, and 'matched_file' names what actually holds the passage.",
      );
    }

    if (hits.length > 0) notes.push(OCR_CAVEAT);

    for (const report of answered) {
      if (report.moreOnThisArchive !== true) continue;
      notes.push(
        args.page < LAST_PAGE
          ? `${report.name} says more matches follow this page. Ask for page ${args.page + 1} to continue reading its side of the answer.`
          : `${report.name} says more matches follow this page, which is the last one this tool will fetch. Narrow the words to reach the rest.`,
      );
    }

    const order =
      contributed.length > 1
        ? "One match from each archive in turn, in the order each archive returned them. Nothing ranks them against each other, and nothing orders them by date: the archives measure a year on different things."
        : contributed.length === 1
          ? `Every match came from ${contributed[0]!.name}, in the order it returned them.`
          : "No archive contributed a match.";

    const body = renderBody(hits, args, merged.asked, answered.length, notes, profiles);

    return ok(
      {
        query: args.query,
        page: args.page,
        hits,
        hit_count: hits.length,
        per_source: merged.reports.map((report) =>
          toReportPayload(report, contextFor(profiles.get(report.source))),
        ),
        order,
        excerpt_kinds: excerptKinds,
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

/** The archive's own profile, attached to its report so a null can be read. */
export function contextFor(profile: SourceProfile | undefined) {
  return profile
    ? {
        yearMeans: profile.yearMeans,
        publishesPageNumber: profile.publishesPageNumber,
        corpus: profile.insideCorpus,
      }
    : {};
}

function renderBody(
  hits: Array<z.infer<typeof hitSchema>>,
  args: SearchInsideArgs,
  asked: number,
  answered: number,
  notes: string[],
  profiles: Map<string, SourceProfile>,
): string {
  if (hits.length === 0) {
    if (answered === 0) {
      return `No archive answered for ${quoteForeign(args.query)}, so nothing here says whether that phrase was ever printed.`;
    }
    return `Nothing came back for ${quoteForeign(args.query)} from the ${answered} of ${asked} archive(s) that answered.`;
  }

  const room = roomForBody({ notes });
  const perHit = Math.max(120, Math.floor(room / hits.length));

  const blocks = hits.map((hit, index) => {
    const where = [
      `${index + 1}. ${quoteForeign(hit.title ?? hit.identifier)}`,
      hit.year === null ? "" : `(${hit.year})`,
      hit.creator ? `· ${quoteForeign(hit.creator)}` : "",
      `· ${quoteForeign(hit.source_name)}`,
      hit.page_number === null
        ? profiles.get(hit.source)?.publishesPageNumber === false
          ? "· this index holds no page number"
          : "· no page number given for this match"
        : `· page ${hit.page_number}`,
      hit.published_on ? `· ${quoteForeign(hit.published_on)}` : "",
      hit.inside_container && hit.matched_file ? `· in ${quoteForeign(hit.matched_file)}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const label = hit.excerpt_kind === "page_opening" ? "page opening" : "passage";
    const passages = hit.excerpts
      .map((excerpt) => `     [${label}] ${truncate(quoteForeign(excerpt), perHit)}`)
      .join("\n");

    return [
      where,
      passages,
      `     id: ${quoteForeign(hit.id)}`,
      `     ${quoteForeign(hit.source_url)}`,
    ]
      .filter((part) => part !== "")
      .join("\n");
  });

  // Whole matches are dropped rather than the block being cut where the room
  // runs out. A cut lands mid-match and takes the identifier and the address
  // with it, leaving a passage a reader can neither check nor cite.
  const head = `${hits.length} matches for ${quoteForeign(args.query)}:`;
  const kept = [...blocks];
  const withheld = () =>
    `(${hits.length - kept.length} further match(es) are in the structured output.)`;
  while (kept.length > 1 && [head, ...kept, withheld()].join("\n").length > room) {
    kept.pop();
  }

  const tail = kept.length < hits.length ? [withheld()] : [];
  return [head, ...kept, ...tail].join("\n");
}
