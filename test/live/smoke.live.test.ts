/**
 * One request per route against the real archives.
 *
 * The unit suite runs against stand-in archives, so it cannot notice that the
 * Internet Archive renamed a field or that the Library of Congress changed the
 * shape of a newspaper row: the day either happens, the unit suite stays green
 * while the published server is broken for everyone. This suite is what
 * notices.
 *
 * It is opt-in. Both archives serve everyone free of charge, one of them is a
 * non-profit and the other a public institution, and a test run on every push
 * has no business adding load to them.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";

const live = process.env.BOOKS_LIVE === "1";
const suite = live ? describe : describe.skip;

const client = new BooksClient({ config: { logLevel: "info" } });

const insideOptions = { limit: 2, page: 1, maxExcerptChars: 200, maxExcerptsPerMatch: 1 };

suite("the archives, as they are today", () => {
  it("answers a full-text search from every archive, and names any that did not", async () => {
    const merged = await client.searchInside('"call me ishmael"', insideOptions);

    for (const report of merged.reports) {
      expect(report.status, `${report.name}: ${report.error?.message ?? ""}`).toBe("answered");
    }
    expect(merged.hits.length).toBeGreaterThan(0);
    expect(new Set(merged.hits.map((hit) => hit.source)).size).toBe(2);
  });

  it("reports no leaf number from the index that holds none", async () => {
    // The first rule search_inside rests on. An index that begins
    // publishing leaves is a change worth knowing about; an index reported as
    // publishing them when it does not is a false citation in every answer.
    const merged = await client.searchInside('"whale ship"', insideOptions);
    const fromArchive = merged.hits.filter((hit) => hit.source === "archive");

    expect(fromArchive.length).toBeGreaterThan(0);
    for (const hit of fromArchive) expect(hit.pageNumber).toBeNull();
  });

  it("reports a leaf number from the index that holds one", async () => {
    const merged = await client.searchInside('"harbour"', insideOptions);
    const fromLoc = merged.hits.filter((hit) => hit.source === "loc");

    expect(fromLoc.length).toBeGreaterThan(0);
    expect(fromLoc.some((hit) => typeof hit.pageNumber === "number")).toBe(true);
  });

  it("tells a matched passage apart from the opening of a page", async () => {
    // The second rule search_inside rests on. A row arriving without the
    // flag would be read as carrying the match when it carries the start of
    // the page, and the words would be quoted as the archive's answer.
    const merged = await client.searchInside('"the fog"', insideOptions);
    const fromLoc = merged.hits.filter((hit) => hit.source === "loc");

    expect(fromLoc.length).toBeGreaterThan(0);
    for (const hit of fromLoc) {
      expect(["passage", "page_opening"]).toContain(hit.excerptKind);
    }
  });

  it("counts different things in each archive and says which", async () => {
    const merged = await client.searchInside('"a wet fog"', insideOptions);

    for (const report of merged.reports) {
      expect(report.reportedTotal, report.name).not.toBeNull();
      expect(report.reportedTotalMeans, report.name).toBeTruthy();
    }
  });

  it("answers a catalogue search from every archive, each in its own vocabulary", async () => {
    const merged = await client.searchItems("moby dick", {
      sort: "relevance",
      limit: 2,
      page: 1,
    });

    for (const report of merged.reports) {
      expect(report.status, `${report.name}: ${report.error?.message ?? ""}`).toBe("answered");
    }
    expect(new Set(merged.rows.map((row) => row.source)).size).toBe(2);
  });

  it("leaves out the archive that files nothing under the name given, and says so", async () => {
    const merged = await client.searchItems("cartography", {
      mediaType: "maps",
      sort: "relevance",
      limit: 2,
      page: 1,
    });
    const archive = merged.reports.find((report) => report.source === "archive")!;

    expect(archive.status).toBe("absent");
    expect(archive.absentBecause).toMatch(/files no kind of material under "maps"/);
  });

  it("hands back identifiers that read back as records", async () => {
    const merged = await client.searchItems("whaling", { sort: "relevance", limit: 2, page: 1 });

    for (const source of ["archive", "loc"] as const) {
      const row = merged.rows.find((entry) => entry.source === source);
      expect(row, `no row from ${source}`).toBeDefined();

      const read = await client.getItem(row!.id);
      expect(read.item.source).toBe(source);
      expect(read.item.sourceUrl.startsWith("https://")).toBe(true);
      expect(read.item.identifier).toBe(row!.identifier);
    }
  });

  it("reports a record no archive holds as an absence carrying a code", async () => {
    // The rule the whole server is built on: an absence is a code, never an
    // empty record that reads as "there is no such thing".
    await expect(
      client.getItem("archive:a-record-that-does-not-exist-here-at-all-0000"),
    ).rejects.toMatchObject({ code: expect.stringMatching(/not_found|parse_failure/) });
  });

  it("names the archive and the moment when a read fails", async () => {
    await expect(
      client.getItem("archive:a-record-that-does-not-exist-here-at-all-0000"),
    ).rejects.toThrow(/the Internet Archive was asked for .* and the read failed/);
  });
});
