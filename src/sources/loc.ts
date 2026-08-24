/**
 * The Library of Congress, as a source.
 *
 * A public institution whose catalogue is divided into one route per kind of
 * material, and whose full-text index reads the pages of American newspapers.
 * A match there carries the leaf it sits on, and carries the opening of the
 * page when the searched words sit further down than the text the row brought
 * back. Its identifiers can carry a separator, because a newspaper page is
 * named by its paper, its date and its edition together.
 */

import type { LocClient } from "mcp-libraryofcongress/client";
import type { Hit, ItemDetail, ItemRow, SourceProfile } from "../types.js";
import type {
  CatalogueQuery,
  Claim,
  InsideQuery,
  ReadDetail,
  ReadRows,
  SortKey,
  SourceAdapter,
} from "./adapter.js";
import {
  budgetedExcerpts,
  count,
  reference,
  namespacedId,
  required,
  rowsOf,
  text,
  textList,
  whole,
} from "./adapter.js";

/** How the Library divides its results into pages. */
export interface LocPaging {
  resultCount: number;
  pageCount: number | null;
  currentPage: number | null;
  perPage: number | null;
}

/** A catalogue row, as the Library's own reader publishes one. */
export interface LocRecordSummary {
  identifier: string | null;
  title: string | null;
  creator: string | null;
  year: number | null;
  date: string | null;
  format: string | null;
  location: string[];
  subjects: string[];
  online: boolean;
  sourceUrl: string;
}

/** A newspaper page whose machine-read text matched. */
export interface LocNewspaperHit {
  identifier: string | null;
  title: string | null;
  creator: string | null;
  year: number | null;
  pageNumber: number | null;
  publishedOn: string | null;
  publication: string | null;
  state: string | null;
  /** True when the searched words were found in the text this row carries. */
  wordsLocated: boolean;
  excerpts: string[];
  sourceUrl: string;
}

/** A record, as the Library's own reader publishes one. */
export interface LocItemDetail {
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  date: string | null;
  format: string | null;
  description: string | null;
  notes: string[];
  subjects: string[];
  location: string[];
  language: string[];
  partOf: string[];
  repository: string | null;
  callNumber: string | null;
  rights: string | null;
  citations: Record<string, string>;
  resources: Array<{
    caption: string | null;
    fileCount: number | null;
    url: string | null;
    imageUrl: string | null;
  }>;
  sourceUrl: string;
}

export interface LocRead<T> {
  data: T;
  cached: boolean;
  skipped?: number;
}

/**
 * The Library keeps one catalogue per kind of material, and a name outside this
 * list addresses nothing. The list is the profile's own, so what the profile
 * publishes and what the client will accept cannot drift apart.
 */
const LOC_ROUTES = [
  "books",
  "photos",
  "maps",
  "audio",
  "film-and-videos",
  "manuscripts",
  "notated-music",
  "newspapers",
] as const;

type LocRoute = (typeof LOC_ROUTES)[number];

/** The kind of material the Library searches when a caller names none. */
const LOC_DEFAULT_MEDIA_TYPE: LocRoute = "books";

/**
 * The route a media type names.
 *
 * A caller's name that no source files under is dropped before the fan-out asks
 * anyone, so a name outside the list cannot reach here; the default stands for
 * the caller who named none.
 */
function routeFor(asked: string | null): LocRoute {
  return LOC_ROUTES.find((one) => one === asked) ?? LOC_DEFAULT_MEDIA_TYPE;
}

/** The part of the Library's client this server uses. */
export interface LocReader {
  // The query is read off the client rather than restated: the Library serves
  // each kind of material on a route of its own, and a format outside that set
  // addresses nothing. Restating it as a plain string would let a caller pass
  // one the client cannot send.
  searchItems: (
    query: Parameters<LocClient["searchItems"]>[0],
  ) => Promise<LocRead<{ paging: LocPaging; records: LocRecordSummary[] }>>;
  searchNewspapers: (
    query: string,
    limit: number,
    page: number,
    budget: { maxChars: number; maxCount: number },
  ) => Promise<LocRead<{ paging: LocPaging; hits: LocNewspaperHit[] }>>;
  getItem: (identifier: string) => Promise<LocRead<LocItemDetail>>;
}

export const LOC_PROFILE: SourceProfile = {
  id: "loc",
  name: "the Library of Congress",
  homeUrl: "https://www.loc.gov",
  attribution: "Source: the Library of Congress",
  creditNote: null,
  searchesOn: "titles, creators and subjects together, across the catalogue it was pointed at",
  searchesOnCaveat: null,
  // Its catalogue scores a record against the words given and answers with the
  // records it ranks highest, so a long query comes back with records carrying
  // some of the words and not the rest.
  catalogueRequiresEveryWord: false,
  // Its full-text route narrows instead: a word absent from every page empties
  // the answer.
  insideRequiresEveryWord: true,
  rowDescribes:
    "a record in the Library's catalogue, which can name something held on a shelf as readily as something digitised",
  insideCorpus:
    "the text optical recognition read off the pages of American newspapers the Library has digitised",
  yearMeans: "the year the Library reads off the date its catalogue record carries",
  descriptionMeans:
    "the description field of the catalogue record, whose contents follow the kind of material: an account of the thing on a photograph, and on a newspaper the place it was published rather than anything about the paper",
  publishesPageNumber: true,
  mediaTypes: [...LOC_ROUTES],
  // The catalogue is one route per kind of material, so a search has to name
  // one. A caller naming none is told which one was read.
  defaultMediaType: LOC_DEFAULT_MEDIA_TYPE,
  answers: ["search_inside", "search_items", "get_item"],
  cannot: {},
  honours: ["year_range", "sort"],
  cannotFilter: {},
  paceMs: 6000,
  paceReason:
    "the Library publishes a ceiling of ten requests a minute across its site, and the lowest published limit governs, so six seconds separate two of its requests",
};

/**
 * Fields this server reads nothing into from the Library.
 *
 * The Library names a served copy and states no file format for it, so the
 * format on every copy from here is empty for that reason and not because a
 * record left it blank.
 */
const UNREAD_FIELDS = ["the format of a copy"];

/** An address on the Library's own hosts, which names the record in its path. */
const SITE_URL = /^https?:\/\/(?:www\.)?loc\.gov\/(item|resource|collections)\/(.+?)\/?$/i;
const LCCN_URL = /^https?:\/\/lccn\.loc\.gov\/([^/?#]+)\/?$/i;
/**
 * An address, whichever host it names.
 *
 * A separator inside an identifier and a separator inside a web address look
 * alike, and claiming both would make an address on somebody else's host a
 * shape this archive mints. An address the two patterns above did not match is
 * an address to some other archive, and is declined.
 */
const LOOKS_LIKE_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
/** A newspaper page is named by its paper, its date and its edition together. */
const CARRIES_SEPARATOR = /^[^\s]*\/[^\s]*$/;
/** A record with no digitised copy is named by a catalogue number alone. */
const BARE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function locAdapter(reader: LocReader): SourceAdapter {
  return {
    ...LOC_PROFILE,

    observedPaceMs(): number | null {
      const paced = (reader as { intervalMs?: unknown }).intervalMs;
      return typeof paced === "number" && Number.isFinite(paced) ? paced : null;
    },

    claims(raw: string): Claim | null {
      const lccn = LCCN_URL.exec(raw);
      if (lccn) {
        return {
          reference: decodeOrRaw(lccn[1] ?? ""),
          why: "the address is a catalogue number on the Library's own host",
          guess: false,
        };
      }

      const site = SITE_URL.exec(raw);
      if (site) {
        const route = (site[1] ?? "").toLowerCase();
        const rest = decodeOrRaw(site[2] ?? "");
        // A collection is named by its slug alone; the address goes on to a
        // page about the collection, which is not part of what names it.
        const own = route === "collections" ? (rest.split("/")[0] ?? rest) : rest;
        return {
          reference: own,
          why: "the address is a record on the Library of Congress",
          guess: false,
        };
      }

      if (LOOKS_LIKE_ADDRESS.test(raw)) {
        return null;
      }

      if (CARRIES_SEPARATOR.test(raw)) {
        return {
          reference: raw,
          why: "an identifier carrying a separator is the shape the Library mints for a newspaper page",
          guess: false,
        };
      }

      if (BARE_REFERENCE.test(raw)) {
        return {
          reference: raw,
          why: "a bare catalogue number is a shape the Library mints",
          guess: false,
        };
      }

      return null;
    },

    async searchInside(query: InsideQuery): Promise<ReadRows<Hit>> {
      const outcome = await reader.searchNewspapers(query.query, query.limit, query.page, {
        maxChars: query.maxExcerptChars,
        maxCount: query.maxExcerptsPerMatch,
      });
      const list = rowsOf<Partial<LocNewspaperHit>>(outcome.data?.hits, LOC_PROFILE);
      const rows: Hit[] = [];
      let skipped = 0;

      for (const raw of list) {
        // Rows past the limit are counted and dropped without being built: an
        // answer asked for five matches has no use for the five thousandth.
        if (rows.length >= query.limit) {
          break;
        }
        const identifier = reference(raw?.identifier);
        const sourceUrl = text(raw?.sourceUrl);
        if (!identifier || !sourceUrl) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(LOC_PROFILE.id, identifier),
          source: LOC_PROFILE.id,
          sourceName: LOC_PROFILE.name,
          identifier,
          title: text(raw?.title),
          creator: text(raw?.creator),
          year: whole(raw?.year),
          pageNumber: whole(raw?.pageNumber),
          excerpts: budgetedExcerpts(
            raw?.excerpts ?? [],
            query.maxExcerptChars,
            query.maxExcerptsPerMatch,
          ),
          // The text a search returns with a page is the opening of what was
          // read off it. When the searched words are not in that opening, the
          // excerpt is where the page starts and not where the match sits.
          excerptKind: raw?.wordsLocated === true ? "passage" : "page_opening",
          sourceUrl,
          matchedFile: null,
          insideContainer: false,
          publishedOn: text(raw?.publishedOn),
          publication: text(raw?.publication),
        });
      }

      return {
        rows,
        skipped: skipped + (outcome.skipped ?? 0),
        reportedTotal: count(outcome.data?.paging?.resultCount),
        reportedTotalMeans:
          "newspaper pages in the Library's digitised corpus that match, across every page of results; it counts leaves rather than titles or occurrences",
        orderedOn: "the Library's own relevance, which no other archive shares",
        cached: outcome.cached,
      };
    },

    async searchItems(query: CatalogueQuery): Promise<ReadRows<ItemRow>> {
      const outcome = await reader.searchItems({
        query: query.query,
        format: routeFor(query.mediaType),
        ...(query.yearFrom === undefined ? {} : { yearFrom: query.yearFrom }),
        ...(query.yearTo === undefined ? {} : { yearTo: query.yearTo }),
        ...(query.sort === null ? {} : { sort: query.sort }),
        // The catalogue answers with digitised material alone unless it is
        // widened. Narrowing it here would drop what the Library holds on a
        // shelf and answer as though it held nothing, so every row comes back
        // and each says whether a copy can be read online.
        onlineOnly: false,
        limit: query.limit,
        page: query.page,
      });
      const list = rowsOf<Partial<LocRecordSummary>>(outcome.data?.records, LOC_PROFILE);
      const rows: ItemRow[] = [];
      let skipped = 0;

      for (const raw of list) {
        if (rows.length >= query.limit) {
          break;
        }
        const identifier = reference(raw?.identifier);
        const sourceUrl = text(raw?.sourceUrl);
        if (!identifier || !sourceUrl) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(LOC_PROFILE.id, identifier),
          source: LOC_PROFILE.id,
          sourceName: LOC_PROFILE.name,
          identifier,
          title: text(raw?.title),
          creator: text(raw?.creator),
          year: whole(raw?.year),
          date: text(raw?.date),
          // The word the record itself uses, which belongs to the Library's
          // catalogue vocabulary rather than to the argument that was sent.
          // Substituting the route a search went down would report the
          // question as though it were the record's own answer.
          mediaType: text(raw?.format),
          sourceUrl: recordAddress(sourceUrl),
          // The Library counts no downloads.
          downloads: null,
          location: textList(raw?.location),
          online: typeof raw?.online === "boolean" ? raw.online : null,
          // The Library mints one kind of identifier and says nothing about
          // settling it, so there is no claim to make either way.
          identifierProvisional: null,
        });
      }

      const asked = query.mediaType ?? LOC_PROFILE.defaultMediaType;
      return {
        rows,
        skipped: skipped + (outcome.skipped ?? 0),
        reportedTotal: count(outcome.data?.paging?.resultCount),
        reportedTotalMeans: `records in the Library's ${asked} catalogue that match, across every page of results; the Library keeps one catalogue per kind of material, so this counts that one alone`,
        orderedOn: orderWords(query.sort),
        cached: outcome.cached,
      };
    },

    async getItem(id: string): Promise<ReadDetail> {
      const outcome = await reader.getItem(id);
      return { item: locDetail(outcome.data), cached: outcome.cached };
    },
  };
}

/**
 * The address of a catalogue record, without the search that reached it.
 *
 * The Library's catalogue hands back an address carrying the words it was given
 * and a leaf chosen for them. A row here is a record, and an address selecting
 * a leaf for the caller's own words presents it as a place those words were
 * printed, which reading a catalogue establishes about nothing. Dropping them
 * leaves the address the Library publishes for the thing itself, unchanged in
 * what it names.
 */
function recordAddress(url: string): string {
  const at = url.indexOf("?");
  return at === -1 ? url : url.slice(0, at);
}

/** A percent sign opening no escape is left as it was written. */
function decodeOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** How the Library was asked to order its own rows, in words. */
function orderWords(sort: SortKey | null): string {
  switch (sort) {
    case "newest":
      return "the date on the Library's catalogue record, newest first";
    case "oldest":
      return "the date on the Library's catalogue record, oldest first";
    case "title":
      return "title, alphabetically";
    default:
      return "the Library's own relevance, which no other archive shares";
  }
}

export function locDetail(payload: unknown): ItemDetail {
  const record = (payload ?? {}) as Partial<LocItemDetail>;
  const identifier = required(reference(record.identifier), "identifier", LOC_PROFILE);

  const resources = (Array.isArray(record.resources) ? record.resources : []).slice(0, MOST_COPIES);
  const copies = resources
    .map((resource) => ({
      // A copy the Library names nothing carries no label, rather than a
      // number this server made up and a reader would quote back.
      label: text(resource?.caption),
      format: null,
      url: text(resource?.url) ?? text(resource?.imageUrl),
    }))
    .filter((copy) => copy.url !== null);

  const context = [...textList(record.partOf)];
  const repository = text(record.repository);
  if (repository) {
    context.push(`held by ${repository}`);
  }
  const callNumber = text(record.callNumber);
  if (callNumber) {
    context.push(`call number ${callNumber}`);
  }

  return {
    id: namespacedId(LOC_PROFILE.id, identifier),
    source: LOC_PROFILE.id,
    sourceName: LOC_PROFILE.name,
    identifier,
    title: text(record.title),
    creator: text(record.creator),
    year: whole(record.year),
    date: text(record.date),
    mediaType: text(record.format),
    sourceUrl: required(record.sourceUrl, "sourceUrl", LOC_PROFILE),
    attribution: LOC_PROFILE.attribution,
    identifierProvisional: null,
    description: text(record.description),
    notes: textList(record.notes),
    subjects: textList(record.subjects),
    // The Library states terms as a sentence on the record. Most records carry
    // none, and a record carrying none has granted nothing. Terms are set per
    // deposit, so what a record states covers that record.
    rights: { statement: text(record.rights), url: null, covers: null },
    copies,
    copiesAvailable: copies.length,
    // The Library lists served copies and nothing beside them.
    generatedEntries: resources.length - copies.length,
    context,
    unreadFields: UNREAD_FIELDS,
  };
}

/** A record served in a hundred parts would swamp an answer of ten rows. */
const MOST_COPIES = 50;
