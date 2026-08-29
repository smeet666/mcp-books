/**
 * Stand-ins for the archives, and the fixed answers they give.
 *
 * Every value here is written out rather than captured from a live page, so no
 * third-party text lives in this repository and a test never depends on what an
 * archive happens to hold today. The titles, the scanned passages and the
 * catalogue numbers are invented.
 */

import { BooksClient } from "../../src/sources/client.js";
import type { SourceAdapter } from "../../src/sources/adapter.js";
import { archiveAdapter } from "../../src/sources/archive.js";
import type {
  ArchiveInsideHit,
  ArchiveItemDetail,
  ArchiveItemSummary,
  ArchiveReader,
} from "../../src/sources/archive.js";
import { locAdapter } from "../../src/sources/loc.js";
import type {
  LocItemDetail,
  LocNewspaperHit,
  LocRecordSummary,
  LocReader,
} from "../../src/sources/loc.js";
import { bnfAdapter } from "../../src/sources/bnf.js";
import type { BnfReader, BnfWorkDetail, BnfWorkSummary } from "../../src/sources/bnf.js";

/** A failure shaped the way an archive's own reader raises one. */
export class FakeSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: { hint?: string } = {},
  ) {
    super(message);
    this.name = "FakeSourceError";
  }
}

/* -------------------------------------------------------------------------- */
/* The Internet Archive, as a stand-in                                         */
/* -------------------------------------------------------------------------- */

export const archiveInsideHits: ArchiveInsideHit[] = [
  {
    identifier: "voyageofthecormorant00pell",
    title: "The Voyage of the Cormorant",
    creator: "Pellisier, Aldous",
    year: 1871,
    matchedFile: null,
    insideContainer: false,
    excerpts: [
      "the harbour lay under a wet fog and the cormorant came about with her rigging humming",
      "no man aboard would say aloud what the fog had shown him that morning",
    ],
    sourceUrl: "https://archive.org/details/voyageofthecormorant00pell",
  },
  {
    identifier: "harbourpapers1883",
    title: "Harbour Papers, 1880-1889",
    creator: "Port of Redlaw",
    year: 1883,
    matchedFile: "harbourpapers1883_002.txt",
    insideContainer: true,
    excerpts: ["a wet fog held the roads for three days and the pilots would not put out"],
    sourceUrl: "https://archive.org/details/harbourpapers1883",
  },
];

export const archiveItemRows: ArchiveItemSummary[] = [
  {
    identifier: "voyageofthecormorant00pell",
    title: "The Voyage of the Cormorant",
    creator: "Pellisier, Aldous",
    year: 1871,
    mediaType: "texts",
    downloads: 412,
    sourceUrl: "https://archive.org/details/voyageofthecormorant00pell",
  },
  {
    identifier: "cormorantlecture1904",
    title: "A Lecture on the Cormorant Voyages",
    creator: "Institute of Redlaw",
    year: 1904,
    mediaType: "texts",
    downloads: 19,
    sourceUrl: "https://archive.org/details/cormorantlecture1904",
  },
];

export const archiveRecord: ArchiveItemDetail = {
  identifier: "voyageofthecormorant00pell",
  title: "The Voyage of the Cormorant",
  creator: "Pellisier, Aldous",
  year: 1871,
  mediaType: "texts",
  downloads: 412,
  sourceUrl: "https://archive.org/details/voyageofthecormorant00pell",
  isCollection: false,
  raw: { subject: "voyages and travels; harbours" },
  description: "An account of a coasting voyage, printed for subscribers.",
  date: "1871",
  publisher: "Redlaw and Sons",
  language: "eng",
  collections: ["americana", "printdisabled"],
  licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  fileCount: 14,
  totalBytes: 84_221_004,
  files: [
    {
      name: "voyageofthecormorant00pell.pdf",
      format: "Text PDF",
      size: 40_112_000,
      downloadUrl:
        "https://archive.org/download/voyageofthecormorant00pell/voyageofthecormorant00pell.pdf",
    },
    {
      name: "voyageofthecormorant00pell_djvu.txt",
      format: "DjVuTXT",
      size: 411_000,
      downloadUrl:
        "https://archive.org/download/voyageofthecormorant00pell/voyageofthecormorant00pell_djvu.txt",
    },
    {
      // The Archive's own bookkeeping, listed beside a record's real files.
      name: "voyageofthecormorant00pell_meta.xml",
      format: "Metadata",
      size: 2100,
      downloadUrl:
        "https://archive.org/download/voyageofthecormorant00pell/voyageofthecormorant00pell_meta.xml",
    },
    {
      // A by-product of the Archive's own processing, told apart by the name
      // the Archive gives its format rather than by the file's name.
      name: "voyageofthecormorant00pell.gif",
      format: "Animated GIF",
      size: 41_000,
      downloadUrl:
        "https://archive.org/download/voyageofthecormorant00pell/voyageofthecormorant00pell.gif",
    },
  ],
};

/** A record whose deposit states no terms at all, which is the ordinary case. */
export const archiveRecordWithoutTerms: ArchiveItemDetail = {
  ...archiveRecord,
  identifier: "cormorantlecture1904",
  title: "A Lecture on the Cormorant Voyages",
  sourceUrl: "https://archive.org/details/cormorantlecture1904",
  licenseUrl: null,
};

/* -------------------------------------------------------------------------- */
/* The Library of Congress, as a stand-in                                      */
/* -------------------------------------------------------------------------- */

export const locInsideHits: LocNewspaperHit[] = [
  {
    identifier: "sn00000001/1884-03-02/ed-1",
    title: "Image 4 of The Redlaw Sentinel, March 2, 1884",
    creator: null,
    year: 1884,
    pageNumber: 4,
    publishedOn: "1884-03-02",
    publication: "the redlaw sentinel (redlaw, kan.) 1871-1899",
    state: "Kansas",
    // The searched words sit further down than the text this row carried.
    wordsLocated: false,
    excerpts: ["MARKET NOTES AND SHIPPING The wharf was quiet through the week and the"],
    sourceUrl: "https://www.loc.gov/resource/sn00000001/1884-03-02/ed-1/?sp=4",
  },
  {
    identifier: "sn00000002/1891-11-19/ed-2",
    title: "Image 1 of The Coast Herald, November 19, 1891",
    creator: null,
    year: 1891,
    pageNumber: 1,
    publishedOn: "1891-11-19",
    publication: "the coast herald (port anselm) 1888-1912",
    state: "Maine",
    wordsLocated: true,
    excerpts: ["…a wet fog closed the roads and the pilot boats stayed at their moorings…"],
    sourceUrl: "https://www.loc.gov/resource/sn00000002/1891-11-19/ed-2/?sp=1",
  },
];

export const locItemRows: LocRecordSummary[] = [
  {
    identifier: "2011000001",
    title: "The Cormorant Voyages: A Reader",
    creator: "Pellisier, Aldous",
    year: 1993,
    date: "1993",
    format: "book",
    location: ["kansas"],
    subjects: ["voyages and travels"],
    online: false,
    sourceUrl: "https://lccn.loc.gov/2011000001",
  },
  {
    identifier: "2011000002",
    title: "Coasting the Northern Shore",
    creator: "Vance, Marguerite",
    year: 1902,
    date: "1902",
    format: "book",
    location: ["maine"],
    subjects: ["harbours"],
    online: true,
    sourceUrl: "https://www.loc.gov/item/2011000002/",
  },
];

export const locRecord: LocItemDetail = {
  identifier: "2011000001",
  title: "The Cormorant Voyages: A Reader",
  creator: "Pellisier, Aldous",
  year: 1993,
  date: "1993",
  format: "book",
  description: "Selected accounts of coasting voyages, with an introduction.",
  notes: ["Includes bibliographical references.", "Printed in an edition of five hundred."],
  subjects: ["voyages and travels", "harbours"],
  location: ["kansas"],
  language: ["english"],
  partOf: ["catalog"],
  repository: "Library of Congress",
  callNumber: "G540.P44 1993",
  rights: null,
  citations: { chicago: "Pellisier, Aldous. The Cormorant Voyages: A Reader." },
  resources: [
    {
      caption: "Read online",
      fileCount: 2,
      url: "https://www.loc.gov/resource/2011000001/",
      imageUrl: null,
    },
  ],
  sourceUrl: "https://lccn.loc.gov/2011000001",
};

/** A record that does state terms, so the two cases can be told apart. */
export const locRecordWithTerms: LocItemDetail = {
  ...locRecord,
  identifier: "2011000002",
  title: "Coasting the Northern Shore",
  sourceUrl: "https://www.loc.gov/item/2011000002/",
  rights: "No known restrictions on publication.",
};

/* -------------------------------------------------------------------------- */
/* A national library's catalogue, as a stand-in                               */
/* -------------------------------------------------------------------------- */

/**
 * The moment the stand-in says its metadata came off the catalogue.
 *
 * It is a value the reader produces rather than a clock reading, so an answer
 * that has to carry a date of retrieval stays identical from one pass to the
 * next.
 */
export const BNF_RETRIEVED_AT = "2026-02-02T12:00:00.000Z";

export const bnfWorkRows: BnfWorkSummary[] = [
  {
    id: "cb11940100c",
    title: "Relation du voyage du Cormoran",
    date: "1874",
    creators: [{ id: "cb10000001x", name: "Pellisier, Aldous" }],
    status: "established",
    sourceUrl: "https://data.bnf.fr/ark:/12148/cb11940100c",
  },
  {
    // A record a cataloguer has not settled, addressed under a digest that can
    // change once they do.
    id: "temp-work/8f14e45fce0a4b0d9c1d3f7a5b2c6e91",
    title: "Le Cormoran, relation abrégée",
    date: "[s.d.]",
    creators: [],
    status: "provisional",
    sourceUrl: "https://data.bnf.fr/temp-work/8f14e45fce0a4b0d9c1d3f7a5b2c6e91/",
  },
];

export const bnfWorkRecord: BnfWorkDetail = {
  id: "cb11940100c",
  title: "Relation du voyage du Cormoran",
  label: "Relation du voyage du Cormoran",
  date: "1874",
  firstYear: 1874,
  creators: [{ id: "cb10000001x", name: "Pellisier, Aldous" }],
  languages: ["fre"],
  forms: ["Récit de voyage"],
  subjects: ["Voyages et découvertes"],
  deweyClasses: ["910"],
  status: "established",
  statusStatement: null,
  expressionCount: 3,
  sameAs: {},
  types: ["http://rdvocab.info/uri/schema/FRBRentitiesRDA/Work"],
  truncated: false,
  catalogueUrl: "https://catalogue.bnf.fr/ark:/12148/cb11940100c",
  depictions: [
    {
      ark: "ark:/12148/btv1b8600000x",
      url: "https://gallica.bnf.fr/ark:/12148/btv1b8600000x",
      role: "depiction",
      fromId: "cb11940100c",
      fromTitle: "Relation du voyage du Cormoran",
    },
  ],
  sourceUrl: "https://data.bnf.fr/ark:/12148/cb11940100c",
};

export interface FakeBnfSide {
  fail?: Error;
  failRecord?: Error;
  rows?: BnfWorkSummary[];
  hasMore?: boolean;
  record?: BnfWorkDetail;
  cached?: boolean;
}

export function fakeBnf(options: FakeBnfSide = {}): BnfReader {
  return {
    async searchWorks() {
      if (options.fail) {
        throw options.fail;
      }
      return {
        data: { rows: options.rows ?? bnfWorkRows, hasMore: options.hasMore ?? true },
        cached: options.cached ?? false,
        retrievedAt: BNF_RETRIEVED_AT,
      };
    },
    async getWork() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecord) {
        throw options.failRecord;
      }
      return {
        data: options.record ?? bnfWorkRecord,
        cached: options.cached ?? false,
        retrievedAt: BNF_RETRIEVED_AT,
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Wiring the stand-ins                                                        */
/* -------------------------------------------------------------------------- */

export interface FakeSide<Hits, Rows, Record> {
  /** Fails everything this archive is asked. */
  fail?: Error;
  /** Fails only the read of one record, so a search still offers a row. */
  failRecord?: Error;
  insideHits?: Hits;
  insideTotal?: number;
  rows?: Rows;
  itemTotal?: number;
  record?: Record;
  cached?: boolean;
}

export interface FakeOptions {
  archive?: FakeSide<ArchiveInsideHit[], ArchiveItemSummary[], ArchiveItemDetail>;
  loc?: FakeSide<LocNewspaperHit[], LocRecordSummary[], LocItemDetail>;
  bnf?: FakeBnfSide;
}

export function fakeArchive(options: NonNullable<FakeOptions["archive"]> = {}): ArchiveReader {
  return {
    async searchInside() {
      if (options.fail) {
        throw options.fail;
      }
      return {
        data: {
          total: options.insideTotal ?? 1740,
          hits: options.insideHits ?? archiveInsideHits,
        },
        cached: options.cached ?? false,
      };
    },
    async searchItems() {
      if (options.fail) {
        throw options.fail;
      }
      return {
        data: { total: options.itemTotal ?? 2529, items: options.rows ?? archiveItemRows },
        cached: options.cached ?? false,
      };
    },
    async getItem() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecord) {
        throw options.failRecord;
      }
      return { data: options.record ?? archiveRecord, cached: options.cached ?? false };
    },
  };
}

export function fakeLoc(options: NonNullable<FakeOptions["loc"]> = {}): LocReader {
  const paging = (resultCount: number) => ({
    resultCount,
    pageCount: 4,
    currentPage: 1,
    perPage: 5,
  });
  return {
    async searchNewspapers() {
      if (options.fail) {
        throw options.fail;
      }
      return {
        data: {
          paging: paging(options.insideTotal ?? 86_314),
          hits: options.insideHits ?? locInsideHits,
        },
        cached: options.cached ?? false,
      };
    },
    async searchItems() {
      if (options.fail) {
        throw options.fail;
      }
      return {
        data: {
          paging: paging(options.itemTotal ?? 1608),
          records: options.rows ?? locItemRows,
        },
        cached: options.cached ?? false,
      };
    },
    async getItem() {
      if (options.fail) {
        throw options.fail;
      }
      if (options.failRecord) {
        throw options.failRecord;
      }
      return { data: options.record ?? locRecord, cached: options.cached ?? false };
    },
  };
}

export const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function fakeClient(options: FakeOptions = {}): BooksClient {
  return new BooksClient({
    logger: silentLogger,
    readers: {
      archive: fakeArchive(options.archive ?? {}),
      loc: fakeLoc(options.loc ?? {}),
      bnf: fakeBnf(options.bnf ?? {}),
    },
  });
}

/**
 * An archive that answers a catalogue and cannot be searched inside its text.
 *
 * A source in that position is what the registry has to survive: it belongs in
 * the answers of the tools it can answer and has to be named as absent from the
 * one it cannot, rather than quietly narrowing that tool to whoever was left.
 */
export const standInProfile = {
  id: "standin",
  name: "a stand-in archive",
  homeUrl: "https://example.invalid",
  attribution: "Source: a stand-in archive",
  insideCorpus: null,
  yearMeans: "the year printed on the volume",
  descriptionMeans: "the description field of the catalogue record",
  publishesPageNumber: false,
  mediaTypes: ["books"],
  defaultMediaType: "books",
  answers: ["search_items", "get_item"] as const,
  cannot: {
    search_inside:
      "The route that searches the text of a document is closed to automated clients by this archive's robots file, so the text behind it is never read.",
  },
  searchesOn: "titles, creators and subjects together",
  searchesOnCaveat: null,
  catalogueRequiresEveryWord: true,
  insideRequiresEveryWord: null,
  rowDescribes: "a volume this archive holds",
  honours: ["year_range", "sort"] as const,
  cannotFilter: {},
  creditNote: null,
  paceMs: 2000,
  paceReason: "this archive states no ceiling, so the spacing is politeness",
};

export function standInAdapter(): SourceAdapter {
  return {
    ...standInProfile,
    answers: [...standInProfile.answers],
    honours: [...standInProfile.honours],
    claims: () => null,
    async searchItems() {
      return {
        rows: [
          {
            id: "standin:sc-4471",
            source: standInProfile.id,
            sourceName: standInProfile.name,
            identifier: "sc-4471",
            title: "Relation du voyage du Cormoran",
            creator: "Pellisier, Aldous",
            year: 1874,
            date: "1874",
            mediaType: "books",
            sourceUrl: "https://example.invalid/ark/sc-4471",
            downloads: null,
            location: [],
            online: true,
            identifierProvisional: null,
          },
        ],
        skipped: 0,
        reportedTotal: 31,
        reportedTotalMeans: "volumes in this archive's own catalogue that match",
        orderedOn: "this archive's own relevance",
        cached: false,
      };
    },
    async getItem() {
      throw new FakeSourceError("not_found", "No record under that name.");
    },
  };
}

/** A client whose registry holds one archive that cannot be searched inside. */
export function clientWithStandIn(options: FakeOptions = {}): BooksClient {
  return new BooksClient({
    logger: silentLogger,
    sources: [
      archiveAdapter(fakeArchive(options.archive ?? {})),
      locAdapter(fakeLoc(options.loc ?? {})),
      standInAdapter(),
    ],
  });
}

/** The archive adapters a test resolves identifiers against. */
export function fakeSources(): SourceAdapter[] {
  return [archiveAdapter(fakeArchive()), locAdapter(fakeLoc()), bnfAdapter(fakeBnf())];
}

/** The text block a tool returned, which is what many clients render. */
export function textOf(result: { content: Array<{ text: string }> }): string {
  return result.content.map((part) => part.text).join("\n");
}

/** The structured payload a tool returned, which an error result does not have. */
export function payloadOf<T = Record<string, unknown>>(result: {
  structuredContent?: Record<string, unknown>;
}): T {
  if (!result.structuredContent) {
    throw new Error("the tool returned no structured content");
  }
  return result.structuredContent as T;
}

/** The arguments a caller sends search_inside, with the schema's defaults. */
export function insideArgs(
  over: Partial<import("../../src/tools/searchInside.js").SearchInsideArgs> = {},
): import("../../src/tools/searchInside.js").SearchInsideArgs {
  return {
    query: "wet fog",
    limit: 5,
    page: 1,
    max_excerpt_chars: 300,
    max_excerpts_per_match: 2,
    fan_out: true,
    ...over,
  };
}

/** The arguments a caller sends search_items, with the schema's defaults. */
export function itemArgs(
  over: Partial<import("../../src/tools/searchItems.js").SearchItemsArgs> = {},
): import("../../src/tools/searchItems.js").SearchItemsArgs {
  return { query: "cormorant", sort: "relevance", limit: 5, page: 1, fan_out: true, ...over };
}

/** The arguments a caller sends get_item, with the schema's defaults. */
export function recordArgs(
  over: Partial<import("../../src/tools/getItem.js").GetItemArgs> & { identifier: string },
): import("../../src/tools/getItem.js").GetItemArgs {
  return {
    sections: ["description"],
    max_copies: 10,
    text_offset: 0,
    max_text_chars: 1500,
    ...over,
  };
}

/** One report out of the per-source list, by archive id. */
export function reportFor(
  payload: { per_source: Array<{ source: string }> },
  source: string,
): Record<string, unknown> {
  const found = payload.per_source.find((report) => report.source === source);
  if (!found) {
    throw new Error(`no report for ${source}`);
  }
  return found as Record<string, unknown>;
}
