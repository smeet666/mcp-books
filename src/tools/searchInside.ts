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
  nonWordCharacters,
  nonWordCharactersNote,
  ok,
  queryNotes,
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
  "Matches whose excerpt carries the searched words are placed before matches whose excerpt is a 'page_opening' and carries them nowhere. That rests on what each row states about its own excerpt rather than on any score, no match is ever dropped for it, and the interleaving holds inside each of the two groups.",
  "The archives read the words given in different ways, and 'per_source' says which each one does. An index that answers only where every word appears returns nothing for a question written as a sentence, even on a work it holds several copies of; an index that scores the words instead answers such a question with the pages it ranks highest, which can carry only some of them. Either way it is the words: a character that is neither a letter nor a digit is no word to an index, and 'non_word_characters' lists any the query carried.",
  "Shorter and differently spelled wordings are therefore derived from the query and asked for their union, which costs nothing extra when the words as asked already answer. Every wording sent is named in 'per_source' with what it returned, every match carries the wording that returned it in 'found_by_query', and 'fan_out' turns the derivation off.",
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
  fan_out: z
    .boolean()
    .default(true)
    .describe(
      "Whether to derive shorter and differently spelled wordings from the query and ask each archive for the union of what they return. A question written as a sentence returns nothing where every word given has to appear, and the rows an index scores highest where it does not. An archive is asked a derived wording only when the words as asked did not return as many rows as 'limit', so a query that works costs one request. Set false to send exactly the words given. 'per_source' names every wording, sent or not, and each match names the one that returned it.",
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
  queries_run: z
    .number()
    .int()
    .describe(
      "Requests this server sent for this answer, counting every wording on every archive. Each archive's own wordings are in 'per_source'.",
    ),
  non_word_characters: z
    .array(z.string())
    .describe(
      "Characters in the query that are neither letters nor digits. These indexes answer on words, so a match here can carry none of them, and 'requires_every_word' covers the words that were given rather than these.",
    ),
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
        fanOut: args.fan_out,
      },
      args.sources as readonly SourceId[] | undefined,
    );

    const hits = merged.hits.map(toHitPayload);
    const notes = [...queryNotes(merged.reports), ...reportNotes(merged.reports, args.page)];

    const answered = merged.reports.filter((report) => report.status === "answered");
    const contributed = merged.reports.filter((report) => report.count > 0);

    // An index that scores the words rather than requiring them all makes a row
    // a weaker statement: it can carry some of the words and not the rest. A
    // reader comparing rows from two archives is comparing two promises.
    for (const report of contributed) {
      if (profiles.get(report.source)?.insideRequiresEveryWord !== false) continue;
      notes.push(
        `${report.name} does not require every word given to appear: it scores them and answers with the pages it ranks highest, so a match of its here can carry only some of them. Read the page before saying the words were printed together.`,
      );
    }

    // An index that does require every word given requires every word, and a
    // character that is no word to it falls outside that promise.
    const outsideTheWords = nonWordCharacters(args.query);
    const outsideNote = nonWordCharactersNote(outsideTheWords);
    if (outsideNote) notes.push(outsideNote);

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

    // Matches are counted apart from excerpts because one match carries several
    // excerpts, and the order below moves matches.
    const carrying = hits.filter((hit) => hit.excerpt_kind === "passage").length;
    const opening = hits.length - carrying;
    const partitioned = carrying > 0 && opening > 0;

    if (excerptKinds.page_opening > 0) {
      const total = excerptKinds.passage + excerptKinds.page_opening;
      // The placement rides on the sentence that already explains what an
      // opening is, rather than arriving as a note of its own. The block a
      // client renders holds a fixed amount of qualifying prose, and a second
      // note here evicts the one saying how to read the next page or the one
      // saying every excerpt is machine-read.
      //
      // It is said only where it changed something. An answer whose matches are
      // all of one kind was placed by nothing, and describing a partition there
      // would tell a reader some of these excerpts carry the words when none
      // does. The full account of the order is in 'order'.
      const placed = partitioned
        ? ", and those matches are listed after the ones that carry them"
        : "";
      notes.push(
        `${excerptKinds.page_opening} of the ${total} excerpts here ${excerptKinds.page_opening === 1 ? "is" : "are"} the opening of a page rather than the passage that matched, across ${opening} ${opening === 1 ? "match" : "matches"}${placed}. The searched words sit further down those pages than the text this server received, so quoting one of them does not quote the match: follow source_url to read the page.`,
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

    // An archive answers with a row and no text of it, and the row is then a
    // place a phrase was matched with nothing quoted from it. Said here, since
    // a match rendered as a title and an address reads as a match whose passage
    // the block had no room for.
    const withoutText = hits.filter((hit) => hit.excerpts.length === 0).length;
    if (withoutText > 0) {
      const which =
        withoutText < hits.length
          ? `${withoutText} of the ${hits.length} matches here`
          : hits.length === 1
            ? "The one match in this answer"
            : "Every match in this answer";
      notes.push(
        `${which} came back with no machine-read text, so nothing here quotes ${withoutText === 1 ? "it" : "them"}: follow source_url to read the page.`,
      );
    }

    if (hits.some((hit) => hit.inside_container)) {
      notes.push(
        "Some matches sit inside a document bundled in a larger record. On those the title, creator and year describe the container, and 'matched_file' names what actually holds the passage.",
      );
    }

    // The caveat is what an excerpt is worth, so it belongs to an answer that
    // carries one. On an answer quoting nothing it describes text that is not
    // there and takes room from a sentence that does qualify the answer.
    if (excerptKinds.passage + excerptKinds.page_opening > 0) notes.push(OCR_CAVEAT);

    for (const report of answered) {
      if (report.moreOnThisArchive !== true) continue;
      notes.push(
        args.page < LAST_PAGE
          ? `${report.name} says more matches follow this page. Ask for page ${args.page + 1} to continue reading its side of the answer.`
          : `${report.name} says more matches follow this page, which is the last one this tool will fetch. Narrow the words to reach the rest.`,
      );
    }

    const order = [
      contributed.length > 1
        ? "One match from each archive in turn, in the order each archive returned them. Nothing ranks them against each other, and nothing orders them by date: the archives measure a year on different things."
        : contributed.length === 1
          ? `Every match came from ${contributed[0]?.name}, in the order it returned them.`
          : "No archive contributed a match.",
      merged.reports.some((report) => report.queries.filter((entry) => entry.ran).length > 1)
        ? "An archive asked more than one wording has its matches in the order those wordings were sent, which is this server's own order over what it received and no archive's judgement of relevance."
        : "",
      partitioned
        ? "Matches whose excerpt carries the searched words come before matches whose excerpt is the opening of a page and carries them nowhere. That is what each row says of itself rather than a score, and the order above holds inside each of the two groups."
        : "",
    ]
      .filter((part) => part !== "")
      .join(" ");

    const queriesRun = merged.reports.reduce(
      (total, report) => total + report.queries.filter((entry) => entry.ran).length,
      0,
    );

    const body = renderBody(hits, args, merged.asked, answered.length, notes, profiles);

    return ok(
      {
        query: args.query,
        page: args.page,
        hits,
        hit_count: hits.length,
        per_source: merged.reports.map((report) =>
          toReportPayload(
            report,
            insideContext(profiles.get(report.source), report.status !== "absent"),
          ),
        ),
        queries_run: queriesRun,
        non_word_characters: outsideTheWords,
        order,
        excerpt_kinds: excerptKinds,
        notes,
      },
      body,
      {
        notes,
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

/**
 * What a full-text answer says about the archive that gave it.
 *
 * The full-text index and the catalogue are two indexes over two bodies of
 * material, and a profile describes both. Only what this tool actually read is
 * attached: the corpus behind the words, whether that index publishes a leaf,
 * whether it answers only where every word appears, and what a year on its rows
 * was measured on. An archive that was never asked has nothing attached at all,
 * since a description of what it reads when asked is no part of this answer.
 */
export function insideContext(profile: SourceProfile | undefined, asked: boolean) {
  return profile && asked
    ? {
        yearMeans: profile.yearMeans,
        publishesPageNumber: profile.publishesPageNumber,
        corpus: profile.insideCorpus,
        requiresEveryWord: profile.insideRequiresEveryWord,
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
    // A match with nothing under it reads as a match the block had no room to
    // quote. It is the archive that sent no text, and the line says so.
    const passages =
      hit.excerpts.length === 0
        ? "     [no machine-read text came back with this match]"
        : hit.excerpts
            .map((excerpt) => `     [${label}] ${truncate(quoteForeign(excerpt), perHit)}`)
            .join("\n");

    // A match the words as asked returned needs no such line: the wording is
    // the head of the block above it. A match a derived wording returned
    // answers that wording's words and not the question as written, and a
    // reader who cannot see which is which reads it as an answer to the whole.
    const under =
      hit.found_by_query !== null && hit.found_by_query !== args.query
        ? `     found under: ${quoteForeign(hit.found_by_query)}`
        : "";

    return [
      where,
      passages,
      under,
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
