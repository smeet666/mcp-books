/**
 * The Internet Archive, as a source.
 *
 * A non-profit holding uploaded scans of books, periodicals and documents. Its
 * full-text index reads what optical recognition took off those pages and
 * returns the passage that matched, with no leaf number: the index holds none.
 * Its identifiers are opaque slugs that carry no separator.
 */

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
  namespacedId,
  queryTerms,
  reference,
  required,
  rowsOf,
  text,
  textList,
  whole,
} from "./adapter.js";

/** A catalogue row, as the Archive's own reader publishes one. */
export interface ArchiveItemSummary {
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  mediaType: string | null;
  downloads: number | null;
  sourceUrl: string;
}

/** A full-text match, as the Archive's own reader publishes one. */
export interface ArchiveInsideHit {
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  matchedFile: string | null;
  insideContainer: boolean;
  excerpts: string[];
  sourceUrl: string;
}

/** A record, as the Archive's own reader publishes one. */
export interface ArchiveItemDetail extends ArchiveItemSummary {
  isCollection: boolean;
  /** Every metadata key the Archive published, which is where subjects live. */
  raw: Record<string, unknown> | null;
  description: string | null;
  date: string | null;
  publisher: string | null;
  language: string | null;
  collections: string[];
  licenseUrl: string | null;
  fileCount: number;
  totalBytes: number | null;
  files: Array<{ name: string; format: string | null; size: number | null; downloadUrl: string }>;
}

/** What one read of the Archive returns. */
export interface ArchiveRead<T> {
  data: T;
  cached: boolean;
  skipped?: number;
}

/** The part of the Archive's client this server uses. */
export interface ArchiveReader {
  searchItems(query: {
    query: string;
    mediaType?: string;
    yearFrom?: number;
    yearTo?: number;
    sort?: "relevance" | "downloads" | "newest" | "oldest" | "title";
    limit: number;
    page: number;
  }): Promise<ArchiveRead<{ total: number; items: ArchiveItemSummary[] }>>;
  searchInside(
    query: string,
    limit: number,
    page: number,
  ): Promise<ArchiveRead<{ total: number; hits: ArchiveInsideHit[] }>>;
  getItem(identifier: string): Promise<ArchiveRead<ArchiveItemDetail>>;
}

export const ARCHIVE_PROFILE: SourceProfile = {
  id: "archive",
  name: "the Internet Archive",
  homeUrl: "https://archive.org",
  attribution: "Source: the Internet Archive",
  creditNote: null,
  searchesOn: "titles, creators and subjects together, in one index over the whole record",
  searchesOnCaveat: null,
  // Its catalogue answers where every word appears in the record: a word no
  // record carries empties the answer rather than being scored down.
  catalogueRequiresEveryWord: true,
  insideRequiresEveryWord: true,
  rowDescribes:
    "a copy of something the Archive holds and serves from its own site, digitised from a particular edition",
  insideCorpus:
    "the text optical recognition read off digitised books, periodicals and documents uploaded to the Archive",
  yearMeans:
    "the year the Archive derives from the record's own metadata, which on a scan is the edition's date and can sit centuries from when the work was written",
  descriptionMeans:
    "the description field of the deposit, which a depositor fills as they see fit: on a scan catalogued from a library record it holds the extent of the volume or a note on the edition rather than an account of the work",
  // The full-text index holds the position of the match within the item rather
  // than a leaf, so there is no page to report.
  publishesPageNumber: false,
  mediaTypes: ["texts", "movies", "audio", "image", "software", "data", "web"],
  // The catalogue searches every kind at once when none is named.
  defaultMediaType: null,
  answers: ["search_inside", "search_items", "get_item"],
  cannot: {},
  honours: ["year_range", "sort"],
  cannotFilter: {},
  paceMs: 1000,
  paceReason:
    "the Archive publishes no ceiling for a client like this one, so a second between requests is politeness rather than a limit",
};

/**
 * Fields this server reads nothing into from the Archive.
 *
 * The Archive files no further prose beside a description, so there is nothing
 * to read. Saying which fields are empty by construction is what lets a caller
 * read an empty one correctly, since an empty field this server never fills and
 * an empty field a record left blank look identical from outside.
 */
const UNREAD_FIELDS = ["notes"];

/**
 * What the Archive generates around a deposit, in its own words for a format.
 *
 * A record lists the files a reader can open beside the Archive's bookkeeping
 * and the by-products of its own processing: metadata documents, catalogue
 * records, optical-recognition working files, logs, torrents and a generated
 * preview. Listing those as copies of the work puts a dozen rows a reader
 * cannot use in front of the scan they came for.
 *
 * The Archive's own name for a format is what this reads, rather than a guess
 * at a file name, so an image deposit keeps its images and a book keeps its
 * scan.
 */
const GENERATED_FORMATS = new Set(
  [
    "metadata",
    "archive bittorrent",
    "item tile",
    "animated gif",
    "log",
    "dublin core",
    "marc",
    "marc binary",
    "marc source",
    "djvu xml",
    "chocr",
    "ocr page index",
    "ocr search text",
    "abbyy gz",
    "word coordinates json",
    "scandata",
    "item cdx index",
    "item cdx meta",
    "web archive gz",
    "grayscale luratech pdf",
    "backup",
    "unknown",
  ].map((name) => name.toLowerCase()),
);

/** Names the Archive gives its bookkeeping whatever format it states for them. */
const BOOKKEEPING_NAME =
  /(?:_meta\.xml|_files\.xml|_meta\.sqlite|_reviews\.xml|_scandata\.xml|_dc\.xml|_marc\.xml|_toc\.xml|_hocr\.html|_hocr_searchtext\.txt\.gz|_hocr_pageindex\.json\.gz|_events\.json|_page_numbers\.json|__ia_thumb\.jpg|\.torrent|\.log)$/i;

/** Whether an entry is the Archive's own working file rather than a copy. */
function isGenerated(entry: { label: string | null; format: string | null }): boolean {
  if (entry.label !== null && BOOKKEEPING_NAME.test(entry.label)) return true;
  return entry.format !== null && GENERATED_FORMATS.has(entry.format.trim().toLowerCase());
}

/** An item page, whose address ends in the identifier. */
const ITEM_URL = /^https?:\/\/(?:www\.)?archive\.org\/(?:details|download|metadata)\/([^/?#]+)/i;
/** The shape the Archive mints: a slug carrying no separator. */
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

export function archiveAdapter(reader: ArchiveReader): SourceAdapter {
  return {
    ...ARCHIVE_PROFILE,

    observedPaceMs(): number | null {
      const paced = (reader as { intervalMs?: unknown }).intervalMs;
      return typeof paced === "number" && Number.isFinite(paced) ? paced : null;
    },

    claims(raw: string): Claim | null {
      const address = ITEM_URL.exec(raw);
      if (address) {
        let reference: string;
        try {
          reference = decodeURIComponent(address[1] ?? "");
        } catch {
          // A percent sign opening no escape is the caller's string rather
          // than an archive that failed.
          return null;
        }
        return {
          reference,
          why: "the address is an item on the Internet Archive",
          guess: false,
        };
      }
      if (REFERENCE.test(raw)) {
        return {
          reference: raw,
          why: "a slug carrying no separator is the shape the Internet Archive mints",
          guess: false,
        };
      }
      return null;
    },

    async searchInside(query: InsideQuery): Promise<ReadRows<Hit>> {
      const outcome = await reader.searchInside(query.query, query.limit, query.page);
      const list = rowsOf<Partial<ArchiveInsideHit>>(outcome.data?.hits, ARCHIVE_PROFILE);
      const terms = queryTerms(query.query);
      const rows: Hit[] = [];
      let skipped = 0;

      for (const raw of list) {
        // Rows past the limit are counted and dropped without being built: an
        // answer asked for five matches has no use for the five thousandth,
        // and building it costs the same as building one that is returned.
        if (rows.length >= query.limit) break;
        // A match needs an identifier to be read again and an address to be
        // cited. A row missing either is dropped rather than returned with a
        // hole where the citation belongs.
        const identifier = reference(raw?.identifier);
        const sourceUrl = text(raw?.sourceUrl);
        if (!identifier || !sourceUrl) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(ARCHIVE_PROFILE.id, identifier),
          source: ARCHIVE_PROFILE.id,
          sourceName: ARCHIVE_PROFILE.name,
          identifier,
          title: text(raw?.title),
          creator: text(raw?.creator),
          year: whole(raw?.year),
          // The index holds no leaf, and a citation naming a page the index
          // does not know is a false citation.
          pageNumber: null,
          excerpts: budgetedExcerpts(
            raw?.excerpts ?? [],
            query.maxExcerptChars,
            query.maxExcerptsPerMatch,
            terms,
          ),
          excerptKind: "passage",
          sourceUrl,
          matchedFile: raw?.insideContainer === true ? text(raw?.matchedFile) : null,
          insideContainer: raw?.insideContainer === true,
          publishedOn: null,
          publication: null,
        });
      }

      return {
        rows,
        skipped: skipped + (outcome.skipped ?? 0),
        reportedTotal: count(outcome.data?.total),
        reportedTotalMeans:
          "what the Archive's full-text index reports as matching, across every page of results",
        orderedOn: "the Archive's own relevance, which no other archive shares",
        cached: outcome.cached,
      };
    },

    async searchItems(query: CatalogueQuery): Promise<ReadRows<ItemRow>> {
      const outcome = await reader.searchItems({
        query: query.query,
        ...(query.mediaType ? { mediaType: query.mediaType } : {}),
        ...(query.yearFrom === undefined ? {} : { yearFrom: query.yearFrom }),
        ...(query.yearTo === undefined ? {} : { yearTo: query.yearTo }),
        ...(query.sort === null ? {} : { sort: query.sort }),
        limit: query.limit,
        page: query.page,
      });
      const list = rowsOf<Partial<ArchiveItemSummary>>(outcome.data?.items, ARCHIVE_PROFILE);
      const rows: ItemRow[] = [];
      let skipped = 0;

      for (const raw of list) {
        if (rows.length >= query.limit) break;
        const identifier = reference(raw?.identifier);
        const sourceUrl = text(raw?.sourceUrl);
        if (!identifier || !sourceUrl) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(ARCHIVE_PROFILE.id, identifier),
          source: ARCHIVE_PROFILE.id,
          sourceName: ARCHIVE_PROFILE.name,
          identifier,
          title: text(raw?.title),
          creator: text(raw?.creator),
          year: whole(raw?.year),
          // The catalogue row carries a year and no dated wording behind it.
          date: null,
          mediaType: text(raw?.mediaType),
          sourceUrl,
          downloads: count(raw?.downloads),
          // The Archive files no place against a catalogue row.
          location: null,
          // The Archive holds a copy of everything it catalogues, so there is
          // no record here that names something held on a shelf alone.
          online: null,
          // The Archive mints one kind of identifier and says nothing about
          // settling it, so there is no claim to make either way.
          identifierProvisional: null,
        });
      }

      return {
        rows,
        skipped: skipped + (outcome.skipped ?? 0),
        reportedTotal: count(outcome.data?.total),
        reportedTotalMeans:
          "records in the Archive's catalogue that match, across every page of results",
        orderedOn: orderWords(query.sort),
        cached: outcome.cached,
      };
    },

    async getItem(reference: string): Promise<ReadDetail> {
      const outcome = await reader.getItem(reference);
      return { item: archiveDetail(outcome.data), cached: outcome.cached };
    },
  };
}

/** How the Archive was asked to order its own rows, in words. */
function orderWords(sort: SortKey | null): string {
  switch (sort) {
    case "newest":
      return "the Archive's own date field, newest first";
    case "oldest":
      return "the Archive's own date field, oldest first";
    case "title":
      return "title, alphabetically";
    default:
      return "the Archive's own relevance, which no other archive shares";
  }
}

export function archiveDetail(payload: unknown): ItemDetail {
  const record = (payload ?? {}) as Partial<ArchiveItemDetail>;
  const identifier = required(reference(record.identifier), "identifier", ARCHIVE_PROFILE);

  const entries = (Array.isArray(record.files) ? record.files : []).map((file) => ({
    label: text(file?.name),
    format: text(file?.format),
    url: text(file?.downloadUrl),
  }));
  const copies = entries
    .filter((entry) => entry.url !== null && !isGenerated(entry))
    .slice(0, MOST_COPIES);

  const context = [...textList(record.collections)];
  const publisher = text(record.publisher);
  if (publisher) context.push(`published by ${publisher}`);

  return {
    id: namespacedId(ARCHIVE_PROFILE.id, identifier),
    source: ARCHIVE_PROFILE.id,
    sourceName: ARCHIVE_PROFILE.name,
    identifier,
    title: text(record.title),
    creator: text(record.creator),
    year: whole(record.year),
    date: text(record.date),
    mediaType: text(record.mediaType),
    sourceUrl: required(record.sourceUrl, "sourceUrl", ARCHIVE_PROFILE),
    attribution: ARCHIVE_PROFILE.attribution,
    identifierProvisional: null,
    description: text(record.description),
    notes: [],
    subjects: subjectsOf(record.raw),
    // The Archive states terms as the address of a licence and writes no
    // wording of its own, and a record carrying neither has granted nothing.
    // Terms are set per deposit, so what a record states covers that record.
    rights: { statement: null, url: text(record.licenseUrl), covers: null },
    copies,
    // Copies this server could list, which is what a caller can open. The
    // Archive's own file count includes its bookkeeping entries and, on a
    // collection, describes the collection's record rather than what is
    // gathered under it, so it is not the number a reader is looking for.
    copiesAvailable: copies.length,
    generatedEntries: entries.length - copies.length,
    context,
    unreadFields: UNREAD_FIELDS,
  };
}

/**
 * Subjects, read out of the metadata the Archive publishes.
 *
 * The Archive files them under one key that holds a single string on one record
 * and a list on another, and often a comma-separated line inside either.
 */
function subjectsOf(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) return [];
  const value = (raw as Record<string, unknown>).subject;
  const entries = typeof value === "string" ? [value] : textList(value);
  const kept = entries.flatMap((entry) =>
    entry
      .split(/\s*[;,]\s*/)
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );
  return [...new Set(kept)].slice(0, MOST_SUBJECTS);
}

/** A record catalogued under two hundred subjects would swamp an answer. */
const MOST_SUBJECTS = 12;

/**
 * Copies read off one record.
 *
 * A much-derived scan lists hundreds of files, and a caller picking a copy to
 * open needs the first handful. The rest are on the record's own page.
 */
const MOST_COPIES = 50;
