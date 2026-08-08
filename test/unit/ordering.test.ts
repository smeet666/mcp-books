/**
 * The order an answer puts its rows in, and what that order rests on.
 *
 * Two orders are at work here and neither is a ranking. Matches are placed by
 * whether the excerpt beside them carries the searched words, which is a
 * property each row states about itself. Catalogue rows keep the order the
 * archive that sent them put them in, and a date order is qualified rather
 * than presented as chronology, because the field it runs on carries a year
 * with no era and holds a stand-in where a record states no date at all.
 */

import { describe, expect, it } from "vitest";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  archiveItemRows,
  bnfWorkRows,
  fakeClient,
  insideArgs,
  itemArgs,
  locInsideHits,
  payloadOf,
  textOf,
} from "./support.js";

interface InsidePayload {
  hits: Array<{ id: string; source: string; excerpt_kind: string }>;
  hit_count: number;
  excerpt_kinds: { passage: number; page_opening: number };
  order: string;
  notes: string[];
}

interface ItemsPayload {
  items: Array<{ id: string; year: number | null }>;
  item_count: number;
  order: string;
  notes: string[];
}

const inside = async (over = {}) =>
  payloadOf<InsidePayload>(await runSearchInside(fakeClient(), insideArgs(over)));

/* -------------------------------------------------------------------------- */
/* Matches that carry the words, and matches that do not                       */
/* -------------------------------------------------------------------------- */

describe("a match whose excerpt is the opening of a page", () => {
  it("is placed after every match whose excerpt carries the searched words", async () => {
    const payload = await inside();
    const kinds = payload.hits.map((hit) => hit.excerpt_kind);

    expect(kinds).toContain("passage");
    expect(kinds).toContain("page_opening");
    expect(kinds.lastIndexOf("passage")).toBeLessThan(kinds.indexOf("page_opening"));
  });

  it("is still in the answer, placed later rather than dropped", async () => {
    const payload = await inside();

    expect(payload.hit_count).toBe(4);
    expect(payload.hits.map((hit) => hit.id).sort()).toEqual(
      [
        "archive:voyageofthecormorant00pell",
        "archive:harbourpapers1883",
        "loc:sn00000001/1884-03-02/ed-1",
        "loc:sn00000002/1891-11-19/ed-2",
      ].sort(),
    );
  });

  it("leaves the one-from-each-archive order standing inside each group", async () => {
    const payload = await inside();

    const carrying = payload.hits.filter((hit) => hit.excerpt_kind === "passage");
    const opening = payload.hits.filter((hit) => hit.excerpt_kind === "page_opening");

    // The interleaved list runs archive, loc, archive, loc, and the second of
    // those loc rows is the only one carrying the words. Each group therefore
    // holds the interleaved order restricted to it, which is what stability
    // means here: no row overtakes another from its own group.
    expect(carrying.map((hit) => hit.source)).toEqual(["archive", "archive", "loc"]);
    expect(carrying.map((hit) => hit.id)).toEqual([
      "archive:voyageofthecormorant00pell",
      "archive:harbourpapers1883",
      "loc:sn00000002/1891-11-19/ed-2",
    ]);
    expect(opening.map((hit) => hit.id)).toEqual(["loc:sn00000001/1884-03-02/ed-1"]);
  });

  it("is named in the order this answer publishes", async () => {
    const payload = await inside();

    expect(payload.order).toMatch(/carr(y|ies) the searched words/i);
    expect(payload.order).toMatch(/opening of a page/i);
  });

  it("is named in the notes, which is all a text-only client renders", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toMatch(/those matches are listed after the ones that carry them/i);
  });

  it("keeps the notes a reader needs most, rather than evicting them", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));

    expect(text).toMatch(/optical recognition read off a scanned page/);
    expect(text).toMatch(/Ask for page 2 to continue/);
  });

  it("rests the order on what each row says of itself, never on a score", async () => {
    const payload = await inside();
    const said = `${payload.order} ${payload.notes.join(" ")}`;

    expect(said).toMatch(/what each row says of itself/i);
    expect(said).not.toMatch(/most relevant|best match|ranked by relevance/i);
  });
});

describe("an answer where every match is the opening of a page", () => {
  it("claims no order it did not perform", async () => {
    const payload = payloadOf<InsidePayload>(
      await runSearchInside(
        fakeClient({
          archive: { insideHits: [] },
          loc: { insideHits: locInsideHits.map((hit) => ({ ...hit, wordsLocated: false })) },
        }),
        insideArgs(),
      ),
    );

    expect(payload.excerpt_kinds.passage).toBe(0);
    expect(payload.excerpt_kinds.page_opening).toBe(2);
    expect(payload.order).not.toMatch(/carr(y|ies) the searched words/i);
    expect(payload.notes.join(" ")).not.toMatch(/listed after the ones that carry/i);
  });

  it("still says every excerpt in front of the reader is an opening", async () => {
    const payload = payloadOf<InsidePayload>(
      await runSearchInside(
        fakeClient({
          archive: { insideHits: [] },
          loc: { insideHits: locInsideHits.map((hit) => ({ ...hit, wordsLocated: false })) },
        }),
        insideArgs(),
      ),
    );
    expect(payload.notes.join(" ")).toMatch(/2 of the 2 excerpts here are the opening of a page/);
  });
});

describe("an answer where every match carries the searched words", () => {
  it("claims no order it did not perform", async () => {
    const payload = await inside({ sources: ["archive"] });

    expect(payload.excerpt_kinds.page_opening).toBe(0);
    expect(payload.order).not.toMatch(/carr(y|ies) the searched words/i);
    expect(payload.notes.join(" ")).not.toMatch(/listed after the ones that carry/i);
  });
});

/* -------------------------------------------------------------------------- */
/* A date order, and what the field it runs on holds                           */
/* -------------------------------------------------------------------------- */

/** The one row of the catalogue fixtures whose date field states a plain year. */
const datedWork = [bnfWorkRows[0]!];

/** Rows whose date field states nothing, which is the case a sort has to place. */
const undatedRows = [
  { ...archiveItemRows[0]!, year: null },
  { ...archiveItemRows[1]!, year: 1904 },
];

const items = async (over = {}, options = {}) =>
  payloadOf<ItemsPayload>(await runSearchItems(fakeClient(options), itemArgs(over)));

describe("a catalogue ordered by date", () => {
  it("says the field it runs on carries a year and no era", async () => {
    const payload = await items({ sort: "oldest" });
    expect(payload.notes.join(" ")).toMatch(/no era/i);
    expect(payload.notes.join(" ")).toMatch(/before the common era/i);
  });

  it("says the first row is not established as the oldest thing an archive holds", async () => {
    const payload = await items({ sort: "oldest" });
    expect(payload.notes.join(" ")).toMatch(/first row is not established as the oldest/i);
  });

  it("counts the rows in front of the reader that carry no year", async () => {
    const payload = await items(
      { sort: "oldest" },
      { archive: { rows: undatedRows }, bnf: { rows: datedWork } },
    );

    expect(payload.items.filter((row) => row.year === null)).toHaveLength(1);
    expect(payload.notes.join(" ")).toMatch(/1 of the 5 rows here carries no year/);
  });

  it("agrees with itself when several rows carry no year", async () => {
    const payload = await items(
      { sort: "oldest" },
      {
        archive: { rows: undatedRows.map((row) => ({ ...row, year: null })) },
        bnf: { rows: datedWork },
      },
    );

    expect(payload.items.filter((row) => row.year === null)).toHaveLength(2);
    expect(payload.notes.join(" ")).toMatch(/2 of the 5 rows here carry no year/);
  });

  it("says where an undated row lands was decided by a stand-in", async () => {
    const payload = await items(
      { sort: "oldest" },
      { archive: { rows: undatedRows }, bnf: { rows: datedWork } },
    );
    expect(payload.notes.join(" ")).toMatch(/stand-in/i);
  });

  it("counts nothing when every row in front of the reader carries a year", async () => {
    const payload = await items({ sort: "oldest" }, { bnf: { rows: datedWork } });

    expect(payload.items.every((row) => row.year !== null)).toBe(true);
    expect(payload.notes.join(" ")).not.toMatch(/rows here carr(y|ies) no year/i);
  });

  it("reaches the notes a text-only client renders", async () => {
    const text = textOf(
      await runSearchItems(
        fakeClient({ archive: { rows: undatedRows }, bnf: { rows: datedWork } }),
        itemArgs({ sort: "oldest" }),
      ),
    );

    expect(text).toMatch(/no era/i);
    expect(text).toMatch(/1 of the 5 rows here carr(y|ies) no year/i);
  });

  it("qualifies a newest-first order on the same field", async () => {
    const payload = await items({ sort: "newest" });
    expect(payload.notes.join(" ")).toMatch(/no era/i);
  });

  it("says no date order spans the archives", async () => {
    const payload = await items({ sort: "oldest" });
    expect(payload.order).toMatch(/no date order spans them/i);
    expect(payload.notes.join(" ")).toMatch(/Each archive ordered its own rows/);
  });

  it("reorders nothing itself, so the rows stay as each archive sent them", async () => {
    const payload = await items(
      { sort: "oldest" },
      { archive: { rows: undatedRows }, bnf: { rows: datedWork } },
    );
    const years = payload.items.map((row) => row.year);

    // A row without a year opened the Archive's own answer and still opens its
    // side of the merge: placing it by its absent date is what this server
    // refuses to do.
    expect(years[0]).toBeNull();
  });
});

describe("a catalogue ordered on something other than a date", () => {
  it("says nothing about eras or undated rows", async () => {
    for (const sort of ["relevance", "title"] as const) {
      const payload = await items(
        { sort },
        { archive: { rows: undatedRows }, bnf: { rows: datedWork } },
      );
      expect(payload.notes.join(" ")).not.toMatch(/no era/i);
      expect(payload.notes.join(" ")).not.toMatch(/rows here carr(y|ies) no year/i);
    }
  });
});
