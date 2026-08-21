/**
 * data.bnf.fr, the open catalogue of the Bibliothèque nationale de France, as a
 * source.
 *
 * It differs from an archive of scans in three ways that an answer must not
 * flatten.
 *
 * It describes **entities**. A row is a work, and a work is not a copy of
 * anything: its editions are records of their own, its author is an authority
 * record of its own, and its identifier is either one the library has settled
 * or a provisional one held while a cataloguer finishes with the record. A
 * provisional identifier can be replaced, so a row says which kind it carries.
 *
 * It searches **titles alone**. The index behind a work search reads the title
 * of the work, so a person's name given here comes back as the works whose
 * title carries that name, which are the books written about them. The profile
 * states the fields, because the same words put to this catalogue and to an
 * index over the whole record are two different questions.
 *
 * It applies **no year range and no order**. The search takes words and returns
 * rows in the order its index holds them. Narrowings it cannot apply are never
 * sent, and the answer names it as an archive they never reached.
 *
 * A record can point at a digitised document on Gallica. Those addresses are
 * published for a person to open: the BnF places its metadata and its digitised
 * contents under two different regimes, so nothing here ever requests one, and
 * this server can say a document exists at an address and nothing at all about
 * what is there.
 */

import type { ItemDetail, ItemRow, SourceProfile } from "../types.js";
import type { CatalogueQuery, Claim, ReadDetail, ReadRows, SourceAdapter } from "./adapter.js";
import { namespacedId, reference, required, rowsOf, text, textList, whole } from "./adapter.js";

/** An identifier this catalogue can address, as its own reader reads one. */
export interface BnfEntityId {
  kind: "ark" | "temp-work";
  id: string;
  iri: string;
  pageUrl: string;
}

/** A link to a digitised document, published as an address rather than opened. */
export interface BnfDigitisedLink {
  ark: string;
  url: string;
  role: "reproduction" | "ocr" | "depiction";
  fromId: string;
  fromTitle: string | null;
}

/** Someone the catalogue credits with a work. */
export interface BnfCreator {
  id: string;
  name: string | null;
}

/** A work, as the catalogue's own reader publishes one row of a search. */
export interface BnfWorkSummary {
  id: string;
  title: string | null;
  date: string | null;
  creators: BnfCreator[];
  status: "established" | "provisional";
  sourceUrl: string;
}

/** A work, read in full. */
export interface BnfWorkDetail extends BnfWorkSummary {
  label: string | null;
  firstYear: number | null;
  languages: string[];
  forms: string[];
  subjects: string[];
  deweyClasses: string[];
  statusStatement: string | null;
  expressionCount: number | null;
  sameAs: Record<string, string[]>;
  types: string[];
  truncated: boolean;
  catalogueUrl: string | null;
  depictions: BnfDigitisedLink[];
}

/** A page of rows, and whether the endpoint held more. */
export interface BnfPage<T> {
  rows: T[];
  hasMore: boolean;
  skipped?: number;
}

/** What one read of the catalogue returns. */
export interface BnfRead<T> {
  data: T;
  cached: boolean;
  /** When the metadata came off the catalogue, which the licence asks to be stated. */
  retrievedAt: string;
  skipped?: number;
}

/** The part of the catalogue's client this server uses. */
export interface BnfReader {
  identify(input: string): BnfEntityId;
  searchWorks(
    title: string,
    limit: number,
    offset: number,
  ): Promise<BnfRead<BnfPage<BnfWorkSummary>>>;
  getWork(id: BnfEntityId): Promise<BnfRead<BnfWorkDetail>>;
}

export const BNF_PROFILE: SourceProfile = {
  id: "bnf",
  name: "the Bibliothèque nationale de France",
  homeUrl: "https://data.bnf.fr",
  attribution: "Source: data.bnf.fr",
  creditNote:
    "this catalogue publishes its metadata on the condition that the source is named and the date the metadata was retrieved is stated, so its credit carries that date and both belong beside anything repeated from it",
  searchesOn:
    "the title of a work and nothing beside it, so a person's name reaches this index as words in a title",
  searchesOnCaveat:
    "reads titles alone, so a person's name given to it comes back as the books about that person rather than the books by them.",
  catalogueRequiresEveryWord: true,
  insideRequiresEveryWord: null,
  rowDescribes:
    "a work as an entity in the catalogue, whose editions and whose author are records of their own rather than a copy anybody holds",
  // The catalogue describes what the library holds and carries none of the text.
  insideCorpus: null,
  yearMeans:
    "the year the catalogue gives the work, read only where the record states a plain year; a record dating a work in words carries none",
  // It describes a work through the headings and classes it links rather than
  // through prose, so no description is read from it and there is nothing to
  // say about what such a field would hold.
  descriptionMeans: null,
  publishesPageNumber: false,
  // Its own name for the kind of thing it files, which names an entity rather
  // than a holding.
  mediaTypes: ["work"],
  // The search reads works and needs no name to be given.
  defaultMediaType: null,
  answers: ["search_items", "get_item"],
  cannot: {
    search_inside:
      "This catalogue describes what the library holds and carries no text of its own, so there is nothing here to search inside: use the catalogue search for a title.",
  },
  honours: [],
  cannotFilter: {
    year_range:
      "Its search takes words and nothing else, so a year range cannot travel with them and its rows were narrowed by no date at all.",
    sort: "Its search returns rows in the order its own index holds them and takes no order to apply, so nothing here was placed by the order that was asked for.",
  },
  paceMs: 3000,
  paceReason:
    "the library publishes a crawl delay of five seconds for its digitisation site and states no rate for this catalogue, so three seconds separate two of its requests and every answer is cached",
};

/**
 * Fields this server reads nothing into from this catalogue.
 *
 * The catalogue describes a work through the classes and headings it links
 * rather than through prose, so there is no description to read.
 */
const UNREAD_FIELDS = ["a description in prose"];

/** The shape the catalogue mints for a record it has settled. */
const ARK_REFERENCE = /^c[bc][0-9a-z]{6,20}$/i;
/** The shape it mints for a record a cataloguer has yet to settle. */
const TEMP_WORK_REFERENCE = /^temp-work\/[0-9a-f]{32}$/i;
/** An address on the catalogue's own host, which names the record in its path. */
const SITE_ARK =
  /^https?:\/\/(?:www\.)?data\.bnf\.fr\/(?:[a-z]{2}\/)?ark:\/12148\/(c[bc][0-9a-z]+)/i;
const SITE_TEMP_WORK = /^https?:\/\/(?:www\.)?data\.bnf\.fr\/temp-work\/([0-9a-f]{32})/i;

export function bnfAdapter(reader: BnfReader): SourceAdapter {
  return {
    ...BNF_PROFILE,

    observedPaceMs(): number | null {
      const paced = (reader as { intervalMs?: unknown }).intervalMs;
      return typeof paced === "number" && Number.isFinite(paced) ? paced : null;
    },

    claims(raw: string): Claim | null {
      const ark = SITE_ARK.exec(raw);
      if (ark) {
        return {
          reference: (ark[1] ?? "").toLowerCase(),
          why: "the address is a record on data.bnf.fr",
          guess: false,
        };
      }

      const temporary = SITE_TEMP_WORK.exec(raw);
      if (temporary) {
        return {
          reference: `temp-work/${(temporary[1] ?? "").toLowerCase()}`,
          why: "the address is a provisional record on data.bnf.fr",
          guess: false,
        };
      }

      if (ARK_REFERENCE.test(raw)) {
        return {
          reference: raw.toLowerCase(),
          why: "an identifier opening on the catalogue's own prefix is a shape it mints",
          guess: false,
        };
      }

      if (TEMP_WORK_REFERENCE.test(raw)) {
        return {
          reference: raw.toLowerCase(),
          why: "an identifier under temp-work is the shape the catalogue mints for a record it has yet to settle",
          guess: false,
        };
      }

      return null;
    },

    async searchItems(query: CatalogueQuery): Promise<ReadRows<ItemRow>> {
      // The search pages by offset, and a page of this size is the page the
      // caller asked for.
      const offset = (query.page - 1) * query.limit;
      const outcome = await reader.searchWorks(query.query, query.limit, offset);
      const list = rowsOf<Partial<BnfWorkSummary>>(outcome.data?.rows, BNF_PROFILE);
      const rows: ItemRow[] = [];
      let skipped = 0;

      for (const raw of list) {
        if (rows.length >= query.limit) break;
        const identifier = reference(raw?.id);
        const sourceUrl = text(raw?.sourceUrl);
        if (!identifier || !sourceUrl) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: namespacedId(BNF_PROFILE.id, identifier),
          source: BNF_PROFILE.id,
          sourceName: BNF_PROFILE.name,
          identifier,
          title: text(raw?.title),
          creator: creditedWith(raw?.creators),
          year: yearOf(raw?.date),
          date: text(raw?.date),
          // The catalogue's own word for what it files, which names an entity.
          mediaType: "work",
          sourceUrl,
          // The catalogue counts no downloads.
          downloads: null,
          // It files no place against a work.
          location: null,
          // A work is not a copy, so there is no copy of it to be online. What
          // a record points at is read from the record itself.
          online: null,
          identifierProvisional: raw?.status === "provisional",
        });
      }

      return {
        rows,
        skipped: skipped + (outcome.skipped ?? 0),
        // Counting every match would mean a second query over the same span,
        // and a count of an index that scores nothing would read as a ranking.
        reportedTotal: null,
        reportedTotalMeans: null,
        hasMore: outcome.data?.hasMore === true,
        orderedOn:
          "the order this catalogue's own index returned them in, which is no measure of how well a row matches",
        attribution: creditFor(outcome.retrievedAt),
        cached: outcome.cached,
      };
    },

    async getItem(reference: string): Promise<ReadDetail> {
      const outcome = await reader.getWork(reader.identify(reference));
      return { item: bnfDetail(outcome.data, outcome.retrievedAt), cached: outcome.cached };
    },
  };
}

/**
 * The credit this catalogue asks for, which carries the moment the metadata was
 * read.
 *
 * The date belongs to the read rather than to the record, so it is written here
 * from what the read reported rather than from a clock this server holds.
 */
function creditFor(retrievedAt: string): string {
  const moment = text(retrievedAt);
  return moment === null
    ? BNF_PROFILE.attribution
    : `${BNF_PROFILE.attribution} — retrieved ${moment}`;
}

/** Everyone the record credits with a work, in the words the record uses. */
function creditedWith(creators: unknown): string | null {
  if (!Array.isArray(creators)) return null;
  const named = creators
    .map((entry) => text((entry as Partial<BnfCreator> | null)?.name))
    .filter((name): name is string => name !== null);
  return named.length === 0 ? null : named.join("; ");
}

/**
 * A year, only where the record states one on its own.
 *
 * A date here is published as written, and a cataloguer writes a century, a
 * span or a mark saying the date is unknown as readily as a year. Reading a
 * number out of any of those would date a work by a fragment of a sentence.
 */
function yearOf(date: unknown): number | null {
  const written = text(date);
  return written !== null && /^\d{3,4}$/.test(written) ? whole(Number(written)) : null;
}

export function bnfDetail(payload: unknown, retrievedAt: string): ItemDetail {
  const record = (payload ?? {}) as Partial<BnfWorkDetail>;
  const identifier = required(reference(record.id), "id", BNF_PROFILE);

  // A record points at digitised documents of two natures. One stands for the
  // work: a reader following it reads the thing itself, or the text a machine
  // read off it. The other illustrates the record, and a catalogue attaches
  // dozens of those, each an image of some other document entirely. Counting an
  // illustration as a copy tells a reader thirty copies are open to them where
  // none is.
  const digitised = Array.isArray(record.depictions) ? record.depictions : [];
  const openable = digitised.filter((link) => STANDS_FOR_THE_WORK.has(String(link?.role)));
  const copies = openable
    .slice(0, MOST_COPIES)
    .map((link) => ({
      label: roleWords(link?.role),
      // The catalogue names no file format for a digitised document.
      format: null,
      url: text(link?.url),
    }))
    .filter((copy) => copy.url !== null);

  // A form arrives as a term out of the catalogue's own vocabulary, and some of
  // those terms are two-letter codes. Quoting it and naming what it is stops a
  // reader taking a code for a word the catalogue wrote about the work.
  const context = textList(record.forms).map(
    (form) => `filed under the form "${form}", a term in this catalogue's own vocabulary`,
  );
  const catalogueUrl = text(record.catalogueUrl);
  if (catalogueUrl) context.push(`also catalogued at ${catalogueUrl}`);

  return {
    id: namespacedId(BNF_PROFILE.id, identifier),
    source: BNF_PROFILE.id,
    sourceName: BNF_PROFILE.name,
    identifier,
    title: text(record.title) ?? text(record.label),
    creator: creditedWith(record.creators),
    year: whole(record.firstYear),
    date: text(record.date),
    mediaType: "work",
    sourceUrl: required(record.sourceUrl, "sourceUrl", BNF_PROFILE),
    attribution: creditFor(retrievedAt),
    identifierProvisional: record.status === "provisional",
    description: null,
    // What the record says about how settled it is, which is prose a cataloguer
    // wrote rather than a description of the work.
    notes: [text(record.statusStatement)].filter((note): note is string => note !== null),
    subjects: textList(record.subjects),
    // The condition is published over the catalogue rather than set per record,
    // so it is stated as covering the catalogue: narrowing it onto this record
    // would say the next record had granted nothing.
    rights: {
      statement:
        "The metadata may be reused on the condition that data.bnf.fr is named as the source and the date it was retrieved is stated.",
      url: null,
      covers: "the metadata of every record this catalogue publishes, this one included",
    },
    copies,
    copiesAvailable: copies.length,
    generatedEntries: digitised.length - copies.length,
    context,
    unreadFields: UNREAD_FIELDS,
  };
}

/**
 * The natures of digitised document that stand for the work itself.
 *
 * A reproduction is the edition, scanned; the text a machine read off it is
 * that edition's words. Either is a copy a reader can open and find the work in.
 */
const STANDS_FOR_THE_WORK: ReadonlySet<string> = new Set(["reproduction", "ocr"]);

/**
 * What a digitised document is to the record that points at it, in words.
 *
 * A reproduction stands for the edition, and an illustration does not. Labelling
 * both a copy would offer a reader a portrait where they asked for the work.
 */
function roleWords(role: unknown): string {
  switch (role) {
    case "reproduction":
      return "a digitised copy of an edition, held on the library's digitisation site";
    case "ocr":
      return "the text a machine read off a digitised copy, held on the library's digitisation site";
    default:
      return "an image the catalogue attaches to illustrate the record, held on the library's digitisation site";
  }
}

/** A record pointing at a hundred documents would swamp an answer of ten rows. */
const MOST_COPIES = 50;
