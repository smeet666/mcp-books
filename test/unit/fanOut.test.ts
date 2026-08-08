/**
 * One question, several wordings.
 *
 * The indexes behind these archives are conjunctive: every word given has to
 * appear on the same page or in the same record. A question asked in natural
 * language therefore returns nothing while a shorter wording built out of the
 * same words returns a great deal, and that nothing reads as an archive holding
 * none of the thing asked about. These cases hold the server to deriving those
 * shorter wordings, asking for the union, keeping the requests bounded, and
 * saying exactly what was sent.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";
import { archiveAdapter } from "../../src/sources/archive.js";
import type {
  ArchiveInsideHit,
  ArchiveItemSummary,
  ArchiveReader,
} from "../../src/sources/archive.js";
import { locAdapter } from "../../src/sources/loc.js";
import type { LocNewspaperHit, LocReader } from "../../src/sources/loc.js";
import { MAX_QUERIES_PER_SOURCE, deriveQueries } from "../../src/sources/variants.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import { insideArgs, itemArgs, payloadOf, reportFor, silentLogger, textOf } from "./support.js";

/* -------------------------------------------------------------------------- */
/* Archives that answer one wording and not another                            */
/* -------------------------------------------------------------------------- */

/** A full-text match, invented, named after the wording that reached it. */
function insideHit(identifier: string): ArchiveInsideHit {
  return {
    identifier,
    title: `Volume ${identifier}`,
    creator: "Rouvier, Estelle",
    year: 1948,
    matchedFile: null,
    insideContainer: false,
    excerpts: ["a line of machine-read text from a scanned page"],
    sourceUrl: `https://archive.org/details/${identifier}`,
  };
}

function newspaperHit(identifier: string): LocNewspaperHit {
  return {
    identifier,
    title: `Image 2 of a printed sheet, ${identifier}`,
    creator: null,
    year: 1903,
    pageNumber: 2,
    publishedOn: "1903-04-11",
    publication: "a printed sheet",
    state: "Kansas",
    wordsLocated: true,
    excerpts: ["a line of machine-read text from a scanned page"],
    sourceUrl: `https://www.loc.gov/resource/${identifier}/?sp=2`,
  };
}

interface Script {
  /** Identifiers this archive returns for a given wording. Absent is nothing. */
  inside?: Record<string, string[]>;
  items?: Record<string, string[]>;
  /** Wordings this archive refuses, and how. */
  fails?: Record<string, Error>;
}

/** A failure shaped the way an archive's own reader raises one. */
class ReaderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: { hint?: string } = {},
  ) {
    super(message);
    this.name = "ReaderError";
  }
}

function scriptedArchive(script: Script, log: string[]): ArchiveReader {
  return {
    async searchInside(query: string) {
      log.push(`archive:${query}`);
      const failure = script.fails?.[query];
      if (failure) throw failure;
      const hits = (script.inside?.[query] ?? []).map(insideHit);
      return { data: { total: hits.length, hits }, cached: false };
    },
    async searchItems(query: { query: string }) {
      log.push(`archive:${query.query}`);
      const failure = script.fails?.[query.query];
      if (failure) throw failure;
      const items: ArchiveItemSummary[] = (script.items?.[query.query] ?? []).map((identifier) => ({
        identifier,
        title: `Volume ${identifier}`,
        creator: "Rouvier, Estelle",
        year: 1948,
        mediaType: "texts",
        downloads: 3,
        sourceUrl: `https://archive.org/details/${identifier}`,
      }));
      return { data: { total: items.length, items }, cached: false };
    },
    async getItem() {
      throw new ReaderError("not_found", "No record under that name.");
    },
  };
}

function scriptedLoc(script: Script, log: string[]): LocReader {
  const paging = (resultCount: number) => ({
    resultCount,
    pageCount: 1,
    currentPage: 1,
    perPage: 5,
  });
  return {
    async searchNewspapers(query: string) {
      log.push(`loc:${query}`);
      const failure = script.fails?.[query];
      if (failure) throw failure;
      const hits = (script.inside?.[query] ?? []).map(newspaperHit);
      return { data: { paging: paging(hits.length), hits }, cached: false };
    },
    async searchItems(query: { query: string }) {
      log.push(`loc:${query.query}`);
      const failure = script.fails?.[query.query];
      if (failure) throw failure;
      const records = (script.items?.[query.query] ?? []).map((identifier) => ({
        identifier,
        title: `Volume ${identifier}`,
        creator: "Rouvier, Estelle",
        year: 1948,
        date: "1948",
        format: "book",
        location: ["kansas"],
        subjects: [],
        online: true,
        sourceUrl: `https://lccn.loc.gov/${identifier}`,
      }));
      return { data: { paging: paging(records.length), records }, cached: false };
    },
    async getItem() {
      throw new ReaderError("not_found", "No record under that name.");
    },
  };
}

function scriptedClient(archive: Script, loc: Script, log: string[]): BooksClient {
  return new BooksClient({
    logger: silentLogger,
    sources: [archiveAdapter(scriptedArchive(archive, log)), locAdapter(scriptedLoc(loc, log))],
  });
}

/** What one archive was asked, in the order it was asked. */
function asked(log: string[], source: string): string[] {
  return log
    .filter((entry) => entry.startsWith(`${source}:`))
    .map((entry) => entry.slice(source.length + 1));
}

interface QueryTrace {
  query: string;
  derivation: string;
  ran: boolean;
  count: number | null;
  added: number | null;
  not_run_because: string | null;
  error: { code: string } | null;
}

interface InsidePayload {
  hits: Array<{ id: string }>;
  hit_count: number;
  queries_run: number;
  order: string;
  notes: string[];
  per_source: Array<{ source: string; status: string; queries: QueryTrace[] }>;
}

/** The whole question, and the wording that actually reaches the work. */
const LONG_QUESTION = "Vipère au poing dénouement se termine roman Bazin fin";
const SHORT_WORDING = "vipère poing";

/* -------------------------------------------------------------------------- */
/* Deriving the wordings                                                       */
/* -------------------------------------------------------------------------- */

describe("the wordings derived from one question", () => {
  it("puts the question as asked first, so nothing displaces what was written", () => {
    const derived = deriveQueries(LONG_QUESTION);
    expect(derived[0]?.query).toBe(LONG_QUESTION);
  });

  it("reduces a long question to its leading words", () => {
    const derived = deriveQueries(LONG_QUESTION).map((variant) => variant.query);
    expect(derived).toContain("vipère poing dénouement");
    expect(derived).toContain(SHORT_WORDING);
  });

  it("puts the reductions before the spellings, because length is what a long question fails on", () => {
    const derived = deriveQueries(LONG_QUESTION).map((variant) => variant.query);
    expect(derived.indexOf(SHORT_WORDING)).toBeLessThan(
      derived.indexOf("Vipere au poing denouement se termine roman Bazin fin"),
    );
  });

  it("offers a quoted phrase without its quotation marks", () => {
    const derived = deriveQueries('"call me ishmael"').map((variant) => variant.query);
    expect(derived).toContain("call me ishmael");
  });

  it("offers the spelling without diacritics", () => {
    const derived = deriveQueries("Kâmasûtra").map((variant) => variant.query);
    expect(derived).toContain("Kamasutra");
  });

  it("runs two words together, because a name is filed as one word in one place", () => {
    const derived = deriveQueries("Kama sutra").map((variant) => variant.query);
    expect(derived).toContain("Kamasutra");
  });

  it("never splits a run-together word, which would need a lexicon this server has none of", () => {
    const derived = deriveQueries("Kamasutra").map((variant) => variant.query);
    expect(derived).toEqual(["Kamasutra"]);
  });

  it("states how each wording was derived, so a reader can retype it knowingly", () => {
    for (const variant of deriveQueries(LONG_QUESTION)) {
      expect(variant.derivation.length, variant.query).toBeGreaterThan(10);
    }
  });

  it("derives no wording twice", () => {
    const derived = deriveQueries(LONG_QUESTION).map((variant) => variant.query.toLowerCase());
    expect(new Set(derived).size).toBe(derived.length);
  });

  it("derives the same list every time it is asked", () => {
    expect(deriveQueries(LONG_QUESTION)).toEqual(deriveQueries(LONG_QUESTION));
  });
});

/* -------------------------------------------------------------------------- */
/* What actually goes out                                                      */
/* -------------------------------------------------------------------------- */

describe("a question no archive answers as asked", () => {
  it("reaches the work through a derived wording instead of returning an absence", async () => {
    const log: string[] = [];
    const client = scriptedClient({ inside: { [SHORT_WORDING]: ["vipereaupoing1948"] } }, {}, log);

    const result = await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 3 }));
    const payload = payloadOf<InsidePayload>(result);

    expect(payload.hit_count).toBeGreaterThan(0);
    expect(payload.hits.map((hit) => hit.id)).toContain("archive:vipereaupoing1948");
    expect(asked(log, "archive")).toContain(SHORT_WORDING);
  });

  it("names every wording it sent and what each one returned", async () => {
    const log: string[] = [];
    const client = scriptedClient({ inside: { [SHORT_WORDING]: ["vipereaupoing1948"] } }, {}, log);

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 3 })),
    );
    const trace = (reportFor(payload, "archive") as unknown as { queries: QueryTrace[] }).queries;
    const ran = trace.filter((entry) => entry.ran);

    expect(ran.map((entry) => entry.query)).toEqual(asked(log, "archive"));
    // A wording that returned nothing is a statement about that wording.
    expect(ran.find((entry) => entry.query === LONG_QUESTION)?.count).toBe(0);
    expect(ran.find((entry) => entry.query === SHORT_WORDING)?.count).toBe(1);
    expect(payload.queries_run).toBe(asked(log, "archive").length + asked(log, "loc").length);
  });

  it("puts what it sent in the text block, so the search can be redone by hand", async () => {
    const log: string[] = [];
    const client = scriptedClient({ inside: { [SHORT_WORDING]: ["vipereaupoing1948"] } }, {}, log);

    const text = textOf(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 3 })),
    );
    expect(text).toContain(SHORT_WORDING);
  });
});

describe("the number of requests", () => {
  it("sends one query to each archive when the first wording fills the limit", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { inside: { "wet fog": ["a1", "a2"] } },
      { inside: { "wet fog": ["sn00000001/1884-03-02/ed-1", "sn00000002/1891-11-19/ed-2"] } },
      log,
    );

    await runSearchInside(client, insideArgs({ query: "wet fog", limit: 2 }));
    expect(log).toHaveLength(2);
  });

  it("never sends more than the ceiling to one archive", async () => {
    const log: string[] = [];
    const client = scriptedClient({}, {}, log);

    await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 5 }));
    expect(asked(log, "archive")).toHaveLength(MAX_QUERIES_PER_SOURCE);
    expect(asked(log, "loc")).toHaveLength(MAX_QUERIES_PER_SOURCE);
  });

  it("sends the words as asked and nothing else when the fan-out is turned off", async () => {
    const log: string[] = [];
    const client = scriptedClient({}, {}, log);

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION, fan_out: false })),
    );

    expect(asked(log, "archive")).toEqual([LONG_QUESTION]);
    expect(asked(log, "loc")).toEqual([LONG_QUESTION]);
    // The wordings it could have sent are still named, so the caller can see
    // what turning the argument on would buy.
    const trace = (reportFor(payload, "archive") as unknown as { queries: QueryTrace[] }).queries;
    expect(trace.filter((entry) => !entry.ran).length).toBeGreaterThan(0);
    for (const entry of trace.filter((entry) => !entry.ran)) {
      expect(entry.not_run_because).toMatch(/fan_out/);
    }
  });

  it("sends the words as asked and nothing else beyond the first page", async () => {
    const log: string[] = [];
    const client = scriptedClient({}, {}, log);

    await runSearchInside(client, insideArgs({ query: LONG_QUESTION, page: 2 }));
    expect(asked(log, "archive")).toEqual([LONG_QUESTION]);
  });

  it("stops asking an archive that did not answer the wording before", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { fails: { [LONG_QUESTION]: new ReaderError("network_error", "the connection was reset") } },
      {},
      log,
    );

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION })),
    );

    expect(asked(log, "archive")).toEqual([LONG_QUESTION]);
    expect(reportFor(payload, "archive").status).toBe("failed");
  });

  it("keeps an archive that answered as asked out of the failures when a derived wording fails", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      {
        inside: { [LONG_QUESTION]: ["a1"] },
        fails: {
          "vipère poing dénouement": new ReaderError("timeout", "the request ran out of time"),
        },
      },
      {},
      log,
    );

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 5 })),
    );
    const report = reportFor(payload, "archive") as unknown as {
      status: string;
      queries: QueryTrace[];
    };

    expect(report.status).toBe("answered");
    expect(report.queries.find((entry) => entry.error)?.error?.code).toBe("timeout");
  });
});

describe("the union of what came back", () => {
  it("keeps one row where two wordings returned the same record", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      {
        inside: {
          [LONG_QUESTION]: ["a1"],
          "vipère poing dénouement": ["a1"],
          [SHORT_WORDING]: ["a1", "a2"],
        },
      },
      {},
      log,
    );

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 5 })),
    );
    const ids = payload.hits.map((hit) => hit.id);

    expect(ids.filter((id) => id === "archive:a1")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps two rows where two archives sent the same string", async () => {
    const log: string[] = [];
    const client = scriptedClient(
      { inside: { "wet fog": ["shared0001"] } },
      { inside: { "wet fog": ["shared0001"] } },
      log,
    );

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: "wet fog", limit: 1 })),
    );

    expect(payload.hits.map((hit) => hit.id).sort()).toEqual([
      "archive:shared0001",
      "loc:shared0001",
    ]);
  });

  it("calls the order its own rather than any archive's judgement of relevance", async () => {
    const log: string[] = [];
    const client = scriptedClient({ inside: { [SHORT_WORDING]: ["a1", "a2"] } }, {}, log);

    const payload = payloadOf<InsidePayload>(
      await runSearchInside(client, insideArgs({ query: LONG_QUESTION, limit: 5 })),
    );

    expect(payload.order).toMatch(/this server/i);
    expect(payload.notes.join(" ")).toMatch(/union/i);
  });
});

describe("the catalogue", () => {
  it("derives wordings there too, because that index is conjunctive as well", async () => {
    const log: string[] = [];
    const client = scriptedClient({ items: { Kamasutra: ["kamasutra1883"] } }, {}, log);

    const payload = payloadOf<{
      items: Array<{ id: string }>;
      queries_run: number;
      per_source: Array<{ source: string; queries: QueryTrace[] }>;
    }>(await runSearchItems(client, itemArgs({ query: "Kama sutra", limit: 5 })));

    expect(payload.items.map((row) => row.id)).toContain("archive:kamasutra1883");
    expect(asked(log, "archive")).toEqual(["Kama sutra", "Kamasutra"]);
  });
});
