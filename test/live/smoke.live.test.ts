/**
 * One request per route against the real archives.
 *
 * The unit suite runs against stand-in archives, so it cannot notice that an
 * archive renamed a field or changed the shape of a row: the day that happens,
 * the unit suite stays green while the published server is broken for everyone.
 * This suite is what notices.
 *
 * It is opt-in. Every archive here serves everyone free of charge, one is a
 * non-profit and the others are public institutions, and a test run on every
 * push has no business adding load to them.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";

const live = process.env.BOOKS_LIVE === "1";
const suite = live ? describe : describe.skip;

const client = new BooksClient({ config: { logLevel: "info" } });

const insideOptions = { limit: 2, page: 1, maxExcerptChars: 200, maxExcerptsPerMatch: 1 };

/**
 * How long a test here is given, counted from what the client is entitled to
 * spend rather than written by hand.
 *
 * The client holds a backstop over each archive that covers every attempt, the
 * pacing owed before each of them and the wait an archive can ask it to keep,
 * and reaching it raises an error naming the archive and the moment. A test cut
 * short before that replaces that error with a bare timeout naming nothing, so
 * a slow night and a changed contract become indistinguishable. Every test says
 * how many searches and how many record reads it makes, and gets the room for
 * each of them.
 */
const budget = (searches: number, reads = 0) =>
  searches * client.slowestAnswerMs + reads * client.slowestDeadlineMs;

suite("the archives, as they are today", () => {
  it(
    "answers a full-text search from every archive, and names any that did not",
    async () => {
      const merged = await client.searchInside('"call me ishmael"', insideOptions);

      for (const report of merged.reports.filter((entry) => entry.status !== "absent")) {
        expect(report.status, `${report.name}: ${report.error?.message ?? ""}`).toBe("answered");
      }
      expect(merged.hits.length).toBeGreaterThan(0);
      expect(new Set(merged.hits.map((hit) => hit.source)).size).toBeGreaterThan(1);
    },
    budget(1),
  );

  it(
    "names an archive holding no text of its own as absent, with the reason",
    async () => {
      const merged = await client.searchInside('"call me ishmael"', insideOptions);
      const absent = merged.reports.filter((report) => report.status === "absent");

      expect(absent.length).toBeGreaterThan(0);
      for (const report of absent) {
        expect(report.stage, report.name).toBeNull();
        expect(report.absentBecause ?? "", report.name).toMatch(/search inside/);
      }
    },
    budget(1),
  );

  it(
    "reports no leaf number from the index that holds none",
    async () => {
      // The first rule search_inside rests on. An index that begins
      // publishing leaves is a change worth knowing about; an index reported as
      // publishing them when it does not is a false citation in every answer.
      const merged = await client.searchInside('"whale ship"', insideOptions);
      const fromArchive = merged.hits.filter((hit) => hit.source === "archive");

      expect(fromArchive.length).toBeGreaterThan(0);
      for (const hit of fromArchive) expect(hit.pageNumber).toBeNull();
    },
    budget(1),
  );

  it(
    "reports a leaf number from the index that holds one",
    async () => {
      const merged = await client.searchInside('"harbour"', insideOptions);
      const fromLoc = merged.hits.filter((hit) => hit.source === "loc");

      expect(fromLoc.length).toBeGreaterThan(0);
      expect(fromLoc.some((hit) => typeof hit.pageNumber === "number")).toBe(true);
    },
    budget(1),
  );

  it(
    "tells a matched passage apart from the opening of a page",
    async () => {
      // The second rule search_inside rests on. A row arriving without the
      // flag would be read as carrying the match when it carries the start of
      // the page, and the words would be quoted as the archive's answer.
      const merged = await client.searchInside('"the fog"', insideOptions);
      const fromLoc = merged.hits.filter((hit) => hit.source === "loc");

      expect(fromLoc.length).toBeGreaterThan(0);
      for (const hit of fromLoc) {
        expect(["passage", "page_opening"]).toContain(hit.excerptKind);
      }
    },
    budget(1),
  );

  it(
    "counts different things in each archive and says which",
    async () => {
      const merged = await client.searchInside('"a wet fog"', insideOptions);

      for (const report of merged.reports.filter((entry) => entry.status === "answered")) {
        expect(report.reportedTotal, report.name).not.toBeNull();
        expect(report.reportedTotalMeans, report.name).toBeTruthy();
      }
    },
    budget(1),
  );

  it(
    "answers a catalogue search from every archive, each in its own vocabulary",
    async () => {
      const merged = await client.searchItems("moby dick", {
        sort: "relevance",
        limit: 2,
        page: 1,
      });

      for (const report of merged.reports) {
        expect(report.status, `${report.name}: ${report.error?.message ?? ""}`).toBe("answered");
      }
      expect(new Set(merged.rows.map((row) => row.source)).size).toBe(3);
    },
    budget(1),
  );

  it(
    "finds through one archive's catalogue what the others do not hold",
    async () => {
      // A catalogue of works reaches an early printed book the archives of scans
      // answer nothing for, which is the whole reason to ask several catalogues.
      const merged = await client.searchItems("dictionnaire français latin", {
        sort: "relevance",
        limit: 5,
        page: 1,
      });
      const fromCatalogue = merged.rows.filter((row) => row.source === "bnf");

      expect(fromCatalogue.length).toBeGreaterThan(0);
      for (const row of fromCatalogue) expect(row.mediaType).toBe("work");
    },
    budget(1),
  );

  it(
    "names the archives a year range never reached, and sends it to nobody else",
    async () => {
      const merged = await client.searchItems("dictionnaire", {
        yearFrom: 1500,
        yearTo: 1600,
        sort: "relevance",
        limit: 2,
        page: 1,
      });

      const dropped = merged.reports.filter((report) => report.filtersDropped.length > 0);
      expect(dropped.length).toBeGreaterThan(0);
      for (const report of dropped) {
        expect(report.filtersDropped.map((entry) => entry.filter)).toContain("year_range");
        expect(report.filtersDropped[0]?.because.length).toBeGreaterThan(20);
      }
    },
    budget(1),
  );

  it(
    "carries the credit an archive's own licence asks for",
    async () => {
      const merged = await client.searchItems("dictionnaire", {
        sort: "relevance",
        limit: 2,
        page: 1,
      });
      const conditional = merged.reports.filter(
        (report) => client.profiles.find((profile) => profile.id === report.source)?.creditNote,
      );

      expect(conditional.length).toBeGreaterThan(0);
      for (const report of conditional) {
        // The date of retrieval is what the condition asks for beyond the name,
        // and only the read that fetched the metadata knows it.
        expect(report.attribution ?? "", report.name).toMatch(/\d{4}-\d{2}-\d{2}T/);
      }
    },
    budget(1),
  );

  it(
    "leaves out the archive that files nothing under the name given, and says so",
    async () => {
      const merged = await client.searchItems("cartography", {
        mediaType: "maps",
        sort: "relevance",
        limit: 2,
        page: 1,
      });
      const archive = merged.reports.find((report) => report.source === "archive")!;

      expect(archive.status).toBe("absent");
      expect(archive.absentBecause).toMatch(/files no kind of material under "maps"/);
    },
    budget(1),
  );

  it(
    "hands back identifiers that read back as records",
    async () => {
      const merged = await client.searchItems("dictionnaire", {
        sort: "relevance",
        limit: 2,
        page: 1,
      });

      for (const source of ["archive", "loc", "bnf"] as const) {
        const row = merged.rows.find((entry) => entry.source === source);
        expect(row, `no row from ${source}`).toBeDefined();

        const read = await client.getItem(row!.id);
        expect(read.item.source).toBe(source);
        expect(read.item.sourceUrl.startsWith("https://")).toBe(true);
        expect(read.item.identifier).toBe(row!.identifier);
      }
    },
    budget(1, 3),
  );

  it(
    "reports a record no archive holds as an absence carrying a code",
    async () => {
      // The rule the whole server is built on: an absence is a code, never an
      // empty record that reads as "there is no such thing".
      await expect(
        client.getItem("archive:a-record-that-does-not-exist-here-at-all-0000"),
      ).rejects.toMatchObject({ code: expect.stringMatching(/not_found|parse_failure/) });
    },
    budget(0, 1),
  );

  it(
    "names the archive and the moment when a read fails",
    async () => {
      await expect(
        client.getItem("archive:a-record-that-does-not-exist-here-at-all-0000"),
      ).rejects.toThrow(/the Internet Archive was asked for .* and the read failed/);
    },
    budget(0, 1),
  );
});
