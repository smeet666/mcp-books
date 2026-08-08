/** The shapes the source layer produces. Nothing here knows about MCP. */

/**
 * Which archive a row, a match or a failure came from.
 *
 * A plain string rather than a closed set of names: the archives this server
 * reads are registered rather than compiled in, so adding one is an entry in
 * the registry and changes nothing here. What the server reads today is
 * whatever the registry holds, and an answer names it.
 */
export type SourceId = string;

/** The three questions an archive can be asked, named for the tool that asks. */
export type Capability = "search_inside" | "search_items" | "get_item";

export const CAPABILITIES: readonly Capability[] = ["search_inside", "search_items", "get_item"];

/**
 * The narrowings a catalogue search can carry, named as a caller names them.
 *
 * Not every catalogue offers them. One that does not is never sent the
 * narrowing, and the answer names it as an archive the narrowing never reached:
 * honouring a filter on some archives and dropping it in silence on another
 * produces a merged list that claims a criterion one of its halves never
 * received.
 */
export type CatalogueFilter = "year_range" | "sort";

export const CATALOGUE_FILTERS: readonly CatalogueFilter[] = ["year_range", "sort"];

/** One narrowing an archive never received, and the reason a caller has to hear. */
export interface DroppedFilter {
  filter: CatalogueFilter;
  because: string;
}

/**
 * What an excerpt is.
 *
 * The two are different objects and are never merged under one name. A
 * `passage` is the text around the words that matched. A `page_opening` is the
 * start of the page the archive matched, sent because the machine-read text
 * that came back with the row stops before the words appear. Reading the second
 * as the first puts words in front of a reader that the excerpt does not carry.
 */
export type ExcerptKind = "passage" | "page_opening";

/** What an archive is, what it holds, and what it can be asked. */
export interface SourceProfile {
  id: SourceId;
  /** What to call the archive in prose and in a credit line. */
  name: string;
  /** The archive's own home, for a reader who wants to go there. */
  homeUrl: string;
  /** What a caller has to say when repeating text from this archive. */
  attribution: string;
  /**
   * What the archive asks for beyond being named, in words. Null where it asks
   * for nothing more. An archive publishing on a condition states that
   * condition here, so an answer can carry it rather than leaving a caller to
   * discover it on the archive's own site.
   */
  creditNote: string | null;
  /**
   * Which fields a catalogue search matches the query against, in words.
   *
   * The same words put to two archives are two questions when one reads titles,
   * creators and subjects and another reads titles alone: a creator's name
   * reaches the second as a subject, and comes back as the books written about
   * that person. The answer publishes this rather than unifying it, because
   * unifying it would need a search neither archive offers.
   */
  searchesOn: string;
  /**
   * What one row of this archive's catalogue is, in words.
   *
   * An archive of scans files a copy it holds; a national catalogue files a
   * work as an entity, whose editions and whose author are records of their
   * own. A row from each carries the same five fields and describes a different
   * kind of thing, and a reader merging them has to be told which.
   */
  rowDescribes: string;
  /**
   * What the corpus behind `search_inside` holds, in words. Two archives
   * answering that tool answer it about different material, and an answer
   * merging them says what each half is.
   */
  insideCorpus: string | null;
  /** What a `year` on this archive's rows was measured on, in words. */
  yearMeans: string;
  /**
   * Whether the full-text index behind `search_inside` carries a page number.
   * Where it does not, `pageNumber` is null on every match, and that null is
   * the index holding none rather than a number this server dropped.
   */
  publishesPageNumber: boolean;
  /** The names this archive files kinds of material under. Its own vocabulary. */
  mediaTypes: readonly string[];
  /**
   * The name used when a caller states none. Null where the archive searches
   * every kind at once and needs no such name.
   */
  defaultMediaType: string | null;
  /** The calls this archive can answer. */
  answers: readonly Capability[];
  /** Why a call outside `answers` cannot be made, in words, keyed by call. */
  cannot: Partial<Record<Capability, string>>;
  /** The narrowings this archive's catalogue applies. */
  honours: readonly CatalogueFilter[];
  /** Why a narrowing outside `honours` never reaches it, in words, keyed by narrowing. */
  cannotFilter: Partial<Record<CatalogueFilter, string>>;
  /** Milliseconds this archive is left between two requests. */
  paceMs: number;
  /** Why the pacing is what it is, in words. */
  paceReason: string;
}

/** One match inside machine-read text. */
export interface Hit {
  /** Carries the archive, and the string get_item takes back. */
  id: string;
  source: SourceId;
  sourceName: string;
  /** The archive's own identifier, without the prefix this server adds. */
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  /**
   * The leaf the passage sits on. Null on an archive whose index holds none,
   * and null on a row of an archive that publishes one but published none here.
   * `SourceProfile.publishesPageNumber` tells the two apart.
   */
  pageNumber: number | null;
  /** Passages of machine-read text, all of one kind. */
  excerpts: string[];
  /** What those passages are: the matched text, or the opening of the page. */
  excerptKind: ExcerptKind;
  sourceUrl: string;
  /** The document the passage sits in, when the record bundles several. */
  matchedFile: string | null;
  /** True when the passage comes from a document inside the record. */
  insideContainer: boolean;
  /** Date of the issue, as published, on a corpus that is dated by issue. */
  publishedOn: string | null;
  /** The newspaper the page belongs to, on a corpus of newspapers. */
  publication: string | null;
}

/** One catalogue row. */
export interface ItemRow {
  id: string;
  source: SourceId;
  sourceName: string;
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  /** The date exactly as published, which is often a range or a phrase. */
  date: string | null;
  /** What this archive calls the kind of thing, in its own vocabulary. */
  mediaType: string | null;
  sourceUrl: string;
  /** Downloads, where the archive counts them. */
  downloads: number | null;
  /**
   * Places the record is catalogued under. Null on an archive that files no
   * place against a catalogue row, which is a different thing from a record
   * catalogued nowhere.
   */
  location: string[] | null;
  /** Whether a digitised copy can be read online, where the archive says. */
  online: boolean | null;
  /**
   * Whether the archive is still to settle this record's identifier.
   *
   * True is an identifier the archive itself calls provisional, which it can
   * replace once a cataloguer finishes with the record, so a citation carrying
   * it can stop naming anything. Null on an archive that mints one kind of
   * identifier and says nothing about settling it, which is a different thing
   * from an archive stating that this one is settled.
   */
  identifierProvisional: boolean | null;
}

/** Terms a record states, and where they were read. */
export interface Rights {
  /** The wording the archive published, or the address of a licence. */
  statement: string | null;
  url: string | null;
  /**
   * What the statement covers, in words. Null where it covers this record
   * alone, which is the case on an archive setting terms per deposit. An
   * archive publishing its whole catalogue on one condition says so here, so
   * the answer never narrows a catalogue-wide condition onto one record.
   */
  covers: string | null;
}

/** One record, read in full. */
export interface ItemDetail {
  id: string;
  source: SourceId;
  sourceName: string;
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  date: string | null;
  mediaType: string | null;
  sourceUrl: string;
  /**
   * What a caller has to say when repeating this record, as this archive
   * states it. An archive asking for the date its metadata was retrieved
   * carries that date here, since only the read that fetched it knows the date.
   */
  attribution: string;
  /** Whether the archive is still to settle this record's identifier. */
  identifierProvisional: boolean | null;
  /** Prose the archive publishes about the record. */
  description: string | null;
  /** Further prose the archive files apart from the description. */
  notes: string[];
  subjects: string[];
  /** Terms this record states. A record stating none carries nulls. */
  rights: Rights;
  /**
   * What the archive offers a reader to open, in the archive's own terms. The
   * label is null where the archive names a copy nothing.
   */
  copies: Array<{ label: string | null; format: string | null; url: string | null }>;
  /** Copies this server read off the record, before any ceiling a caller set. */
  copiesAvailable: number;
  /**
   * Entries the archive lists that are its own bookkeeping or the by-products
   * of its own processing rather than copies of the thing. Named so a reader
   * comparing this count against the archive's own page knows what was set
   * aside.
   */
  generatedEntries: number;
  /** Collections, divisions and shelves the record sits in. */
  context: string[];
  /**
   * Fields this server reads nothing into from this archive. An empty field
   * named here is empty for every record, which is a different thing from a
   * record that left it blank.
   */
  unreadFields: string[];
}

/**
 * One wording put to one archive, or one derived and left unsent.
 *
 * The list of these is what makes an answer reproducible: a reader with it can
 * retype any of the wordings and see the same rows come back. A wording that
 * returned nothing is kept for the same reason, since it says something about
 * that wording rather than about the corpus.
 */
export interface QueryAttempt {
  query: string;
  /** How this wording was derived from the question, in words. */
  derivation: string;
  /** Whether it was actually sent to the archive. */
  ran: boolean;
  /** Rows the archive returned for it. Null when it was not sent, or failed. */
  count: number | null;
  /**
   * Rows it contributed that no earlier wording in this answer had already
   * returned. Null when it was not sent, or failed.
   */
  added: number | null;
  /** Why it was not sent. Null when it was. */
  notRunBecause: string | null;
  /** Why this wording did not answer. Null when it did, or was never sent. */
  error: { code: string; message: string; hint?: string } | null;
}

/**
 * What one archive did with one question, whether or not it produced anything.
 *
 * Status and stage travel together so an answer can never read as an absence.
 * A caller seeing `failed` at the `search` stage knows the archive was asked
 * and did not reply, which is a different statement from an archive that
 * answered and holds nothing, and different again from one that was never
 * asked because it cannot answer this question at all.
 */
export interface SourceReport {
  source: SourceId;
  name: string;
  /**
   * `answered` means it replied. `failed` means it was asked and did not.
   * `absent` means it was not asked, and `absentBecause` says why.
   */
  status: "answered" | "failed" | "absent";
  /**
   * Which moment this report is about: the search that looks for records, or
   * the read that opens one. Null on an archive that was never asked.
   */
  stage: "search" | "read" | null;
  /** Why an archive was left out, in words. Null unless the status is absent. */
  absentBecause: string | null;
  /** Rows this archive contributed to the answer. */
  count: number;
  /** What this archive said it saw, in the terms it counts in. */
  reportedTotal: number | null;
  /** What `reportedTotal` counts on this archive, in words. */
  reportedTotalMeans: string | null;
  /**
   * Rows the archive sent that could not be read, and were left out. Null on an
   * answer served from a cache that kept the rows and not the count of what was
   * dropped building them, where a zero would be a figure nobody established.
   */
  skipped: number | null;
  /** The order this archive returned its own rows in, in words. */
  orderedOn: string | null;
  /** The name this archive was asked with, in its own vocabulary. */
  mediaTypeAsked: string | null;
  /**
   * What a caller has to say when repeating what this archive contributed, as
   * this archive states it for this answer. Null on an archive that was never
   * asked, and on one whose credit is its name alone.
   */
  attribution: string | null;
  /**
   * Narrowings the caller asked for that this archive never received, each
   * with the reason. Empty when it received every one of them, and empty on a
   * call that carries no narrowing at all.
   */
  filtersDropped: DroppedFilter[];
  /**
   * Every wording derived for this archive, in the order they were tried, with
   * what each one returned. Empty on a call that carries no query.
   */
  queries: QueryAttempt[];
  /**
   * Whether this archive says it holds matches beyond the page just read. Null
   * where it states no total, and on an archive that was never asked.
   */
  moreOnThisArchive: boolean | null;
  cached: boolean;
  error: { code: string; message: string; hint?: string } | null;
}

export interface MergedHits {
  hits: Hit[];
  reports: SourceReport[];
  /**
   * Archives that were actually asked. An archive reported as absent was never
   * asked, so counting it among them would say a question was put to it.
   */
  asked: number;
}

export interface MergedItems {
  rows: ItemRow[];
  reports: SourceReport[];
  asked: number;
}
