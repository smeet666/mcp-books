/**
 * Which archive a sentence is about, said with that archive's name.
 *
 * The archives here are not all archives: one is a national library and another
 * a library's catalogue, and a sentence written about "the archive" names none
 * of them. Where the answer holds the name, the sentence carries it, so a
 * reader never has to work out which of several archives a warning belongs to.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";
import { archiveAdapter } from "../../src/sources/archive.js";
import { locAdapter } from "../../src/sources/loc.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import type { LocReader, LocRecordSummary } from "../../src/sources/loc.js";
import {
  FakeSourceError,
  fakeArchive,
  fakeClient,
  itemArgs,
  locItemRows,
  locInsideHits,
  locRecord,
  payloadOf,
  recordArgs,
  silentLogger,
  textOf,
} from "./support.js";

/** The name the Library's own reports and notes are written under. */
const LIBRARY = "the Library of Congress";

/** A word standing where the name of an archive belongs. */
const STAND_IN = /\bthe archive\b/i;

interface ItemsPayload {
  notes: string[];
  per_source: Array<{
    name: string;
    reported_total_means: string | null;
    queries: Array<{ query: string; not_run_because: string | null }>;
  }>;
}

const paging = (resultCount: number) => ({
  resultCount,
  pageCount: 4,
  currentPage: 1,
  perPage: 5,
});

/**
 * A library whose catalogue answers a row of its own for every wording.
 *
 * A count reported for one wording, beside rows a later wording returned, is
 * the case that qualifies that count, and the qualification is what has to name
 * the library it is about.
 */
function libraryAnsweringEachWording(): LocReader {
  let call = 0;
  return {
    async searchNewspapers() {
      return { data: { paging: paging(10), hits: locInsideHits }, cached: false };
    },
    async searchItems() {
      call += 1;
      const row: LocRecordSummary = {
        ...locItemRows[0]!,
        identifier: `201100000${call}`,
        title: `A record for wording ${call}`,
        sourceUrl: `https://lccn.loc.gov/201100000${call}`,
      };
      return { data: { paging: paging(374), records: [row] }, cached: false };
    },
    async getItem() {
      return { data: locRecord, cached: false };
    },
  };
}

function clientWith(loc: LocReader): BooksClient {
  return new BooksClient({
    logger: silentLogger,
    sources: [archiveAdapter(fakeArchive()), locAdapter(loc)],
  });
}

/** A question long enough for further wordings to be derived from it. */
const QUESTION = "Le Voyage du Cormoran raconté par Pellisier";

describe("a count qualified by the wording it was reported for", () => {
  it("names the library that reported it", async () => {
    const payload = payloadOf<ItemsPayload>(
      await runSearchItems(
        clientWith(libraryAnsweringEachWording()),
        itemArgs({ query: QUESTION }),
      ),
    );
    const library = payload.per_source.find((report) => report.name === LIBRARY)!;

    expect(library.reported_total_means).toMatch(/wording/);
    expect(library.reported_total_means).toContain(LIBRARY);
    expect(library.reported_total_means).not.toMatch(STAND_IN);
  });
});

describe("a wording withheld because the one before it failed", () => {
  it("names the library that did not answer", async () => {
    const library = libraryAnsweringEachWording();
    const payload = payloadOf<ItemsPayload>(
      await runSearchItems(
        clientWith({
          ...library,
          async searchItems() {
            throw new FakeSourceError("timeout", "the read timed out");
          },
        }),
        itemArgs({ query: QUESTION }),
      ),
    );
    const withheld = payload.per_source
      .find((report) => report.name === LIBRARY)!
      .queries.map((entry) => entry.not_run_because)
      .filter((because): because is string => because !== null);

    expect(withheld.length).toBeGreaterThan(0);
    for (const because of withheld) {
      expect(because).toContain(LIBRARY);
      expect(because).not.toMatch(STAND_IN);
    }
  });
});

describe("a record an archive answered about and served no whole record for", () => {
  it("names the library in the refusal", async () => {
    const result = await runGetItem(
      fakeClient({
        loc: { failRecord: new FakeSourceError("parse_failure", "the record could not be read") },
      }),
      recordArgs({ identifier: "loc:2011000001" }),
    );

    expect(textOf(result)).toContain(LIBRARY);
    expect(textOf(result)).not.toMatch(STAND_IN);
  });
});

describe("an answer served out of the cache", () => {
  it("names the library the record was kept from", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runGetItem(
        fakeClient({ loc: { cached: true } }),
        recordArgs({ identifier: "loc:2011000001" }),
      ),
    );
    const cached = payload.notes.filter((note) => /cache/i.test(note));

    expect(cached.length).toBe(1);
    expect(cached[0]).toContain(LIBRARY);
    expect(cached[0]).not.toMatch(STAND_IN);
  });

  it("names the archives whose rows were kept, in a merged answer", async () => {
    const payload = payloadOf<ItemsPayload>(
      await runSearchItems(fakeClient({ loc: { cached: true } }), itemArgs()),
    );
    const cached = payload.notes.filter((note) => /cache/i.test(note));

    expect(cached.length).toBe(1);
    expect(cached[0]).toContain(LIBRARY);
    expect(cached[0]).not.toMatch(STAND_IN);
  });
});
