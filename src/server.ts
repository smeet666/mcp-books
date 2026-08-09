/**
 * Wiring: one client over the registered archives, three tools, and the
 * guidance a model reads before using any of them.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { BooksClient } from "./sources/client.js";
import { SOURCE_PROFILES } from "./sources/registry.js";
import { getItemDescription, getItemInput, getItemOutput, runGetItem } from "./tools/getItem.js";
import type { GetItemArgs } from "./tools/getItem.js";
import {
  runSearchInside,
  searchInsideDescription,
  searchInsideInput,
  searchInsideOutput,
} from "./tools/searchInside.js";
import type { SearchInsideArgs } from "./tools/searchInside.js";
import {
  runSearchItems,
  searchItemsDescription,
  searchItemsInput,
  searchItemsOutput,
} from "./tools/searchItems.js";
import type { SearchItemsArgs } from "./tools/searchItems.js";
import type { SourceProfile } from "./types.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  client?: BooksClient;
}

/** Every tool only reads. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * The guidance a model reads before choosing a tool.
 *
 * Every sentence is drawn from the registry rather than written into the prose,
 * so it stays true when the registry grows: which archives are read, which of
 * them answers which tool, which one publishes a page number, and how long an
 * answer takes. An archive that cannot answer a tool is named here, so a caller
 * knows before asking that the answer will be narrower than the server.
 */
export function buildInstructions(
  profiles: readonly SourceProfile[],
  pacing: ReadonlyArray<{ name: string; intervalMs: number; because: string }>,
): string {
  const named = profiles.map((profile) => profile.name).join(" and ");
  const insideAble = profiles.filter((profile) => profile.answers.includes("search_inside"));
  const insideUnable = profiles.filter((profile) => !profile.answers.includes("search_inside"));
  const noPage = insideAble.filter((profile) => !profile.publishesPageNumber);
  const slowest = [...pacing].sort((left, right) => right.intervalMs - left.intervalMs)[0];

  const lines = [
    `Tools for printed and scanned material, reading ${profiles.length} archives: ${named}. No API key and no account are needed.`,
    "search_inside reads the machine-read text itself and is the reason to ask several archives at once. search_items reads their catalogues. get_item reads one record, routed by the archive its identifier names.",
    "Choosing between the two searches is the one mistake that answers confidently: a phrase printed on a page is search_inside, a title, a creator or a subject is search_items, and the wrong one gives a confident empty answer or a list of works that merely mention the words.",
    `The corpora behind search_inside are different bodies of material: ${insideAble
      .map((profile) => `${profile.name} reads ${profile.insideCorpus}`)
      .join(
        "; ",
      )}. A search of them asks where a phrase was printed in any of them, so the answer is additive: a match from one archive is no evidence about the others, and nothing is put side by side.`,
  ];

  for (const profile of insideUnable) {
    lines.push(
      `${profile.name} cannot be searched inside its text, so it is named as absent from that tool rather than quietly left out. ${profile.cannot.search_inside ?? ""}`.trim(),
    );
  }

  if (noPage.length > 0) {
    lines.push(
      `${noPage.map((profile) => profile.name).join(" and ")} publishes no leaf number, so page_number is null on every match from it. That null is the index holding no page, never a page that was dropped, and no page is ever invented in its place.`,
    );
  }

  lines.push(
    "Every match carries excerpt_kind. A 'passage' is the text around the words that matched; a 'page_opening' is the start of the page, sent because the machine-read text stops before those words appear, so it does not carry the match. The notes say how many excerpts are openings.",
    "Every excerpt is what optical recognition read off a scanned page, so repeat it as scanned text and link the page.",
    "An archive that fails is named as an archive that failed, with the moment that failed: a search that did not answer, or a search that answered and a record that could not be read. An answer holding rows from some archives is never evidence about what the others hold.",
    "The archives share no scale. Their counts count different things and are never added, no score ranks their rows against each other, and there is no order by date across them: a year is the date of an edition in one place and the date on a catalogue record in another.",
    "media_type keeps one name across the archives and a vocabulary per archive. An archive that files nothing under the name given is named as absent from that call, with its own names listed, rather than asked under a translation.",
    "Terms of reuse are stated per record and never summed for an answer. A record stating none has granted nothing, and an archive publishing its whole catalogue on one condition says so as a condition over the catalogue.",
  );

  // The same words are not the same question everywhere, and a caller reading
  // one merged list is the reader least able to see it.
  const searchFields = profiles.filter((profile) => profile.answers.includes("search_items"));
  if (new Set(searchFields.map((profile) => profile.searchesOn)).size > 1) {
    lines.push(
      `search_items matches the words given against different fields on each archive: ${searchFields
        .map((profile) => `${profile.name} on ${profile.searchesOn}`)
        .join(
          "; ",
        )}. The same query is therefore a different question in each, and per_source says which fields each one read.`,
    );
  }

  // What follows from a narrow index is written per archive, so it is named
  // with the archive it is true of rather than as a general caution.
  for (const profile of searchFields) {
    if (!profile.searchesOnCaveat) continue;
    lines.push(`${profile.name} ${profile.searchesOnCaveat}`);
  }

  // Whether an index narrows on the words or scores them decides what an empty
  // answer and a surprising row each mean, and the archives differ.
  const strict = searchFields.filter((profile) => profile.catalogueRequiresEveryWord);
  const scoring = searchFields.filter((profile) => !profile.catalogueRequiresEveryWord);
  if (strict.length > 0 && scoring.length > 0) {
    lines.push(
      `The archives do not read a query the same way. ${strict
        .map((profile) => profile.name)
        .join(
          " and ",
        )} answer${strict.length === 1 ? "s" : ""} only where every word given appears, so a question written as a sentence comes back empty there. ${scoring
        .map((profile) => profile.name)
        .join(
          " and ",
        )} score${scoring.length === 1 ? "s" : ""} the words instead and answer${scoring.length === 1 ? "s" : ""} with what ${scoring.length === 1 ? "it ranks" : "they rank"} highest, so a row from ${scoring.length === 1 ? "it" : "them"} can carry only some of the words. Both searches derive further wordings from a query for that reason, per_source says which archive is which, and every row names the wording that returned it.`,
    );
  }

  const unfiltered = profiles.filter(
    (profile) => profile.answers.includes("search_items") && profile.honours.length === 0,
  );
  for (const profile of unfiltered) {
    lines.push(
      `${profile.name} applies neither year_from and year_to nor sort, so those are never sent to it and per_source names it as an archive they did not reach. Its rows sit in the merged list unnarrowed by them.`,
    );
  }

  // Where an archive rows describe different kinds of thing, a caller merging
  // them has to be able to read which.
  if (new Set(profiles.map((profile) => profile.rowDescribes)).size > 1) {
    lines.push(
      `A row means a different thing on each archive: ${profiles
        .map((profile) => `on ${profile.name} it is ${profile.rowDescribes}`)
        .join(
          "; ",
        )}. Rows carry the same fields throughout, and per_source says what each archive's row describes.`,
    );
  }

  for (const profile of profiles) {
    if (!profile.creditNote) continue;
    lines.push(
      `${profile.name} publishes on a condition: ${profile.creditNote}. Its credit line and its records carry what to say, and repeating both is what the condition asks for.`,
    );
  }

  if (slowest) {
    lines.push(
      `Answers take several seconds. ${slowest.name} is left ${Math.round(slowest.intervalMs / 1000)} seconds between requests, because ${slowest.because}. The archives are asked at the same time rather than one after another, so a slow answer is the pacing rather than a stall: wait for it.`,
    );
  }

  lines.push(
    "Every result carries a source_url. Credit the archive you took something from and link what you use.",
  );

  return lines.join(" ");
}

/** The guidance as it reads for the archives this build registers. */
export const INSTRUCTIONS = buildInstructions(
  SOURCE_PROFILES,
  SOURCE_PROFILES.map((profile) => ({
    name: profile.name,
    intervalMs: profile.paceMs,
    because: profile.paceReason,
  })),
);

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = options.client ?? new BooksClient({ config, logger });

  const server = new McpServer(
    { name: "mcp-books", version: PKG_VERSION },
    { instructions: buildInstructions(client.profiles, client.pacing) },
  );

  server.registerTool(
    "search_inside",
    {
      title: "Find a phrase in the scanned text of every archive",
      description: searchInsideDescription,
      inputSchema: searchInsideInput,
      outputSchema: searchInsideOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchInside(client, args as SearchInsideArgs),
  );

  server.registerTool(
    "search_items",
    {
      title: "Search every catalogue at once",
      description: searchItemsDescription,
      inputSchema: searchItemsInput,
      outputSchema: searchItemsOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchItems(client, args as SearchItemsArgs),
  );

  server.registerTool(
    "get_item",
    {
      title: "Read one record, routed by the archive its identifier names",
      description: getItemDescription,
      inputSchema: getItemInput,
      outputSchema: getItemOutput,
      annotations: READ_ONLY,
    },
    async (args) => runGetItem(client, args as GetItemArgs),
  );

  logger.info(
    `ready: ${client.profiles.length} archives (${client.pacing
      .map((entry) => `${entry.id} at ${entry.intervalMs}ms`)
      .join(", ")}), user-agent="${client.userAgent}"`,
  );

  return server;
}
