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
 *
 * Every test here asks what an archive publishes, and an archive that was
 * unreachable published nothing to ask about. The two are kept apart: a test
 * whose archive did not answer is skipped with the failure named, and one
 * closing test reports an archive that never answered at all. Reading a silence
 * as a contract that moved is the one way this suite can raise a false alarm,
 * and the alarm it raises opens an issue.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";
import type { ItemDetail, SourceId, SourceReport } from "../../src/types.js";
import { BooksError } from "../../src/errors.js";

const live = process.env.BOOKS_LIVE === "1";
const suite = live ? describe : describe.skip;

const client = new BooksClient({ config: { logLevel: "info" } });

const insideOptions = { limit: 2, page: 1, maxExcerptChars: 200, maxExcerptsPerMatch: 1 };

/**
 * How many times a search is put again while an archive a test needs is silent.
 *
 * An archive's own reader already retries what the archive answers with a
 * retryable status, so this covers the case that reader gives up on: a service
 * refusing for as long as one call is willing to wait. The archives that did
 * answer are served from the cache on the attempts that follow, so what a
 * further attempt costs is one archive being asked again.
 */
const ATTEMPTS = 3;

/** The codes that say the question never reached the archive. */
const UNREACHABLE = new Set(["network_error", "timeout", "rate_limited"]);

/**
 * Which archives answered something tonight, so a total outage is still news.
 *
 * A test skipped for an archive that was unreachable is the right answer to one
 * bad moment and the wrong answer to an archive that has gone for good: skip
 * every test and the run is green over an archive nobody can reach. This is
 * what the closing test reads.
 */
const answered = new Set<SourceId>();

/** What to say about an archive that never answered, naming what it answered with. */
const outage = (reports: readonly SourceReport[]): string =>
  reports
    .map(
      (report) =>
        `${report.name} did not answer, after ${ATTEMPTS} attempts: [${report.error?.code ?? "unknown"}] ${report.error?.message ?? ""}`,
    )
    .join(" ");

/**
 * Put a search, and say which of the archives it needed never answered.
 *
 * The rows an archive sends are the only evidence about what it publishes, so a
 * test that has none of them has nothing to check rather than something to
 * report. The search is put again while an archive it names is failing, and
 * what comes back is the last answer along with those archives.
 */
async function asking<T extends { reports: SourceReport[] }>(
  needs: readonly SourceId[],
  work: () => Promise<T>,
): Promise<{ merged: T; unreachable: SourceReport[] }> {
  let merged = await work();
  let unreachable: SourceReport[] = [];

  for (let attempt = 1; ; attempt += 1) {
    for (const report of merged.reports) {
      if (report.status === "answered") answered.add(report.source);
    }
    unreachable = merged.reports.filter(
      (report) => needs.includes(report.source) && report.status === "failed",
    );
    if (unreachable.length === 0 || attempt >= ATTEMPTS) break;
    merged = await work();
  }

  return { merged, unreachable };
}

/**
 * The room one test is given, counted from what the client is entitled to
 * spend rather than written by hand.
 *
 * The client holds a backstop over each archive that covers every attempt, the
 * pacing owed before each of them and the wait an archive can ask it to keep,
 * and reaching it raises an error naming the archive and the moment. A test cut
 * short before that replaces that error with a bare timeout naming nothing, so
 * a slow night and a changed contract become indistinguishable. Every test says
 * how many searches and how many record reads it makes, and gets the room for
 * each of them. A search is put again while an archive it needs is silent, so
 * the room for one covers every attempt it is allowed.
 */
const budget = (searches: number, reads = 0) =>
  ATTEMPTS * searches * client.slowestAnswerMs + reads * client.slowestDeadlineMs;

/** A failure this suite can branch on, or one that belongs to nobody here. */
const asBooksError = (raised: unknown): BooksError => {
  if (raised instanceof BooksError) return raised;
  throw raised;
};

/**
 * Read one record, with an archive that could not be reached named instead.
 *
 * A record that reads back is what this checks, and an archive that never
 * answered read nothing back. The read is put again while the archive is
 * failing, for the same reason a search is.
 */
async function readingBack(
  id: string,
): Promise<{ item: ItemDetail | null; unreachable: string | null }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const read = await client.getItem(id);
      answered.add(read.report.source);
      return { item: read.item, unreachable: null };
    } catch (raised) {
      const known = asBooksError(raised);
      if (!UNREACHABLE.has(known.code)) throw known;
      if (attempt >= ATTEMPTS) {
        return { item: null, unreachable: `[${known.code}] ${known.message}` };
      }
    }
  }
}

/**
 * The failure a read of a record no archive holds raises.
 *
 * A read that succeeds ends the test on the spot: the identifier is meant to
 * name nothing, and an archive answering with a record for it is a change worth
 * the alarm this suite raises.
 */
async function refused(id: string): Promise<BooksError> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.getItem(id);
    } catch (raised) {
      const known = asBooksError(raised);
      if (!UNREACHABLE.has(known.code) || attempt >= ATTEMPTS) return known;
      continue;
    }
    throw new Error(`"${id}" was read back as a record, and no archive holds it.`);
  }
}

suite("the archives, as they are today", () => {
  it(
    "answers a full-text search from more than one archive at once",
    async (ctx) => {
      const { merged, unreachable } = await asking(["archive", "loc"], () =>
        client.searchInside('"call me ishmael"', insideOptions),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));

      expect(merged.hits.length).toBeGreaterThan(0);
      expect(new Set(merged.hits.map((hit) => hit.source)).size).toBeGreaterThan(1);
    },
    budget(1),
  );

  it(
    "names an archive holding no text of its own as absent, with the reason",
    async () => {
      // An archive left out for want of the route is named whatever the others
      // answered, so this needs none of them.
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
    async (ctx) => {
      // The first rule search_inside rests on. An index that begins
      // publishing leaves is a change worth knowing about; an index reported as
      // publishing them when it does not is a false citation in every answer.
      const { merged, unreachable } = await asking(["archive"], () =>
        client.searchInside('"whale ship"', insideOptions),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));
      const fromArchive = merged.hits.filter((hit) => hit.source === "archive");

      expect(fromArchive.length).toBeGreaterThan(0);
      for (const hit of fromArchive) expect(hit.pageNumber).toBeNull();
    },
    budget(1),
  );

  it(
    "reports a leaf number from the index that holds one",
    async (ctx) => {
      const { merged, unreachable } = await asking(["loc"], () =>
        client.searchInside('"harbour"', insideOptions),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));
      const fromLoc = merged.hits.filter((hit) => hit.source === "loc");

      expect(fromLoc.length).toBeGreaterThan(0);
      expect(fromLoc.some((hit) => typeof hit.pageNumber === "number")).toBe(true);
    },
    budget(1),
  );

  it(
    "tells a matched passage apart from the opening of a page",
    async (ctx) => {
      // The second rule search_inside rests on. A row arriving without the
      // flag would be read as carrying the match when it carries the start of
      // the page, and the words would be quoted as the archive's answer.
      const { merged, unreachable } = await asking(["loc"], () =>
        client.searchInside('"the fog"', insideOptions),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));
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
    async (ctx) => {
      const { merged, unreachable } = await asking(["archive", "loc"], () =>
        client.searchInside('"a wet fog"', insideOptions),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));

      for (const report of merged.reports.filter((entry) => entry.status === "answered")) {
        expect(report.reportedTotal, report.name).not.toBeNull();
        expect(report.reportedTotalMeans, report.name).toBeTruthy();
      }
    },
    budget(1),
  );

  it(
    "answers a catalogue search from every archive, each in its own vocabulary",
    async (ctx) => {
      const { merged, unreachable } = await asking(["archive", "loc", "bnf"], () =>
        client.searchItems("moby dick", { sort: "relevance", limit: 2, page: 1 }),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));

      expect(new Set(merged.rows.map((row) => row.source)).size).toBe(3);
    },
    budget(1),
  );

  it(
    "finds through one archive's catalogue what the others do not hold",
    async (ctx) => {
      // A catalogue of works reaches an early printed book the archives of scans
      // answer nothing for, which is the whole reason to ask several catalogues.
      const { merged, unreachable } = await asking(["bnf"], () =>
        client.searchItems("dictionnaire français latin", {
          sort: "relevance",
          limit: 5,
          page: 1,
        }),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));
      const fromCatalogue = merged.rows.filter((row) => row.source === "bnf");

      expect(fromCatalogue.length).toBeGreaterThan(0);
      for (const row of fromCatalogue) expect(row.mediaType).toBe("work");
    },
    budget(1),
  );

  it(
    "names the archives a year range never reached, and sends it to nobody else",
    async () => {
      // What an archive cannot narrow on is settled before anything is sent, so
      // a silent archive still reports the range as dropped. The rows are what
      // would be missing, and nothing here reads them.
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
    async (ctx) => {
      const conditional = client.profiles.filter((profile) => profile.creditNote);
      const { merged, unreachable } = await asking(
        conditional.map((profile) => profile.id),
        () => client.searchItems("dictionnaire", { sort: "relevance", limit: 2, page: 1 }),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));

      const carrying = merged.reports.filter((report) =>
        conditional.some((profile) => profile.id === report.source),
      );
      expect(carrying.length).toBeGreaterThan(0);
      for (const report of carrying) {
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
      // An archive left out over a kind of material it does not file is settled
      // from its own profile, so this holds whether or not it answered.
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
    async (ctx) => {
      const { merged, unreachable } = await asking(["archive", "loc", "bnf"], () =>
        client.searchItems("dictionnaire", { sort: "relevance", limit: 2, page: 1 }),
      );
      if (unreachable.length > 0) return ctx.skip(outage(unreachable));

      for (const source of ["archive", "loc", "bnf"] as const) {
        const row = merged.rows.find((entry) => entry.source === source);
        expect(row, `no row from ${source}`).toBeDefined();

        const read = await readingBack(row!.id);
        if (read.unreachable) return ctx.skip(read.unreachable);
        expect(read.item!.source).toBe(source);
        expect(read.item!.sourceUrl.startsWith("https://")).toBe(true);
        expect(read.item!.identifier).toBe(row!.identifier);
      }
    },
    budget(1, 3),
  );

  it(
    "reports a record no archive holds as an absence carrying a code",
    async (ctx) => {
      // The rule the whole server is built on: an absence is a code, never an
      // empty record that reads as "there is no such thing".
      const raised = await refused("archive:a-record-that-does-not-exist-here-at-all-0000");
      if (UNREACHABLE.has(raised.code)) return ctx.skip(`${raised.code}: ${raised.message}`);

      expect(raised.code).toMatch(/not_found|parse_failure/);
    },
    budget(0, 1),
  );

  it(
    "names the archive and the moment when a read fails",
    async (ctx) => {
      const raised = await refused("archive:a-record-that-does-not-exist-here-at-all-0000");
      if (UNREACHABLE.has(raised.code)) return ctx.skip(`${raised.code}: ${raised.message}`);

      expect(raised.message).toMatch(/the Internet Archive was asked for .* and the read failed/);
    },
    budget(0, 1),
  );

  it("was answered at least once tonight by every archive", () => {
    // Every test above stands down for an archive that did not answer, which is
    // the honest reading of one bad moment and the wrong reading of an archive
    // that has gone. This is where an archive nothing reached is reported.
    const silent = client.profiles
      .filter((profile) => !answered.has(profile.id))
      .map((profile) => profile.name);

    expect(silent, `reached by nothing tonight: ${silent.join(", ")}`).toEqual([]);
  });
});
