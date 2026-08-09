/**
 * What the answers are allowed to claim.
 *
 * Each case here names a statement the server could make and must not: a page
 * number it does not hold, an excerpt that is not what it looks like, a total
 * nobody published, an order across quantities that were never the same one,
 * and a sentence about reuse covering more records than the one it came from.
 */

import { describe, expect, it } from "vitest";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  archiveRecordWithoutTerms,
  fakeClient,
  insideArgs,
  itemArgs,
  locInsideHits,
  locRecordWithTerms,
  payloadOf,
  recordArgs,
  reportFor,
  textOf,
} from "./support.js";

interface InsidePayload {
  hits: Array<{
    source: string;
    page_number: number | null;
    excerpt_kind: string;
    excerpts: string[];
    id: string;
    identifier: string;
  }>;
  hit_count: number;
  per_source: Array<{ source: string; publishes_page_number: boolean | null }>;
  excerpt_kinds: { passage: number; page_opening: number };
  order: string;
  notes: string[];
}

const inside = async (over = {}) =>
  payloadOf<InsidePayload>(await runSearchInside(fakeClient(), insideArgs(over)));

describe("a page number the index does not hold", () => {
  it("is null on every match from the archive that publishes none", async () => {
    const payload = await inside();
    const fromArchive = payload.hits.filter((hit) => hit.source === "archive");

    expect(fromArchive.length).toBeGreaterThan(0);
    for (const hit of fromArchive) expect(hit.page_number).toBeNull();
  });

  it("is a real leaf on the archive that publishes one", async () => {
    const payload = await inside();
    const fromLoc = payload.hits.filter((hit) => hit.source === "loc");

    expect(fromLoc.length).toBeGreaterThan(0);
    for (const hit of fromLoc) expect(typeof hit.page_number).toBe("number");
  });

  it("says which archive holds no leaf, so the null can be read", async () => {
    const payload = await inside();

    expect(reportFor(payload, "archive").publishes_page_number).toBe(false);
    expect(reportFor(payload, "loc").publishes_page_number).toBe(true);
    expect(payload.notes.join(" ")).toMatch(/publishes no leaf number/);
  });

  it("never prints a page number for a match that carries none", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    // Every line naming a match says either a leaf, or which of the two kinds
    // of silence produced the null.
    expect(text).toMatch(/this index holds no page number/);
  });
});

describe("an excerpt that is the opening of a page", () => {
  it("is marked apart from the passage that matched", async () => {
    const payload = await inside();
    const kinds = new Set(payload.hits.map((hit) => hit.excerpt_kind));

    expect(kinds.has("passage")).toBe(true);
    expect(kinds.has("page_opening")).toBe(true);
  });

  it("counts how many excerpts are openings rather than passages", async () => {
    const payload = await inside();

    expect(payload.excerpt_kinds.page_opening).toBe(1);
    expect(payload.excerpt_kinds.passage).toBe(4);
    expect(payload.notes.join(" ")).toMatch(/1 of the 5 excerpts here is the opening of a page/);
  });

  it("says an opening does not carry the match", async () => {
    const payload = await inside();
    expect(payload.notes.join(" ")).toMatch(
      /does not quote the match|do not carry|sit further down/i,
    );
  });

  it("labels the kind in the text a client renders", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toContain("[page opening]");
    expect(text).toContain("[passage]");
  });

  it("stays silent about openings when every excerpt is a passage", async () => {
    const payload = payloadOf<InsidePayload>(
      await runSearchInside(fakeClient(), insideArgs({ sources: ["archive"] })),
    );
    expect(payload.excerpt_kinds.page_opening).toBe(0);
    expect(payload.notes.join(" ")).not.toMatch(/opening of a page/);
  });
});

describe("counts", () => {
  it("are reported per archive and never added into one number", async () => {
    const payload = await inside();
    const totals = payload.per_source.map(
      (report) => (report as unknown as { reported_total: number | null }).reported_total,
    );

    expect(totals).toContain(1740);
    expect(totals).toContain(86_314);
    // The sum of the two appears nowhere, and neither does any single total
    // presented as the answer's own.
    expect(JSON.stringify(payload)).not.toContain(String(1740 + 86_314));
  });

  it("says in as many words that they count different things", async () => {
    const payload = await inside();
    expect(payload.notes.join(" ")).toMatch(/never added together/);
  });

  it("names what each archive's own number counts", async () => {
    const payload = await inside();
    const means = payload.per_source.map(
      (report) =>
        (report as unknown as { reported_total_means: string | null }).reported_total_means,
    );
    expect(means.join(" ")).toMatch(/full-text index/);
    expect(means.join(" ")).toMatch(/leaves rather than titles/);
  });

  it("reports the answer's own size as a count of what came back", async () => {
    const payload = await inside();
    expect(payload.hit_count).toBe(payload.hits.length);
  });
});

describe("order", () => {
  it("interleaves the archives rather than ranking them", async () => {
    const payload = await inside();
    // Matches whose excerpt carries the searched words are placed ahead of the
    // one whose excerpt is a page opening, so the alternation is read inside
    // each of those groups rather than across the whole list.
    const carrying = payload.hits.filter((hit) => hit.excerpt_kind === "passage");
    const opening = payload.hits.filter((hit) => hit.excerpt_kind === "page_opening");

    expect(carrying.map((hit) => hit.source)).toEqual(["archive", "archive", "loc"]);
    expect(opening.map((hit) => hit.source)).toEqual(["loc"]);
    expect(payload.order).toMatch(/in turn/);
  });

  it("says no date order spans the archives", async () => {
    const payload = await inside();
    expect(payload.order).toMatch(/nothing orders them by date/i);
  });

  it("keeps a date sort inside each catalogue rather than across them", async () => {
    const payload = payloadOf<{ order: string; notes: string[] }>(
      await runSearchItems(fakeClient(), itemArgs({ sort: "oldest" })),
    );
    expect(payload.order).toMatch(/no date order spans them/i);
    expect(payload.notes.join(" ")).toMatch(/Each archive ordered its own rows/);
  });

  it("never sorts the merged rows by year", async () => {
    const payload = payloadOf<{ items: Array<{ year: number | null }> }>(
      await runSearchItems(fakeClient(), itemArgs({ sort: "oldest" })),
    );
    const years = payload.items.map((row) => row.year ?? 0);
    const ascending = [...years].sort((left, right) => left - right);
    // The fixture rows are ordered so a sort across archives would show up here.
    expect(years).not.toEqual(ascending);
  });
});

describe("a year", () => {
  it("carries what it was measured on, per archive", async () => {
    const payload = payloadOf<{
      per_source: Array<{ source: string; year_means: string | null }>;
    }>(await runSearchItems(fakeClient(), itemArgs()));

    expect(String(reportFor(payload, "archive").year_means)).toMatch(/edition/i);
    expect(String(reportFor(payload, "loc").year_means)).toMatch(/catalogue record/i);
  });

  it("says a year range was applied on two different readings", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchItems(fakeClient(), itemArgs({ year_from: 1800, year_to: 1900 })),
    );
    expect(payload.notes.join(" ")).toMatch(/not necessarily dated by the same measure/);
  });
});

describe("identifiers", () => {
  it("name the archive they came from", async () => {
    const payload = await inside();
    for (const hit of payload.hits) {
      expect(hit.id).toBe(`${hit.source}:${hit.identifier}`);
    }
  });

  it("keep an identifier carrying a separator intact", async () => {
    const payload = await inside();
    const fromLoc = payload.hits.find((hit) => hit.source === "loc")!;
    expect(fromLoc.identifier).toContain("/");
    expect(fromLoc.id.startsWith("loc:")).toBe(true);
  });

  it("are never quoted in a shape other than the one an archive received", async () => {
    // A control character is invisible where an answer is rendered, so an
    // answer quoting the string with it removed names a record nobody asked
    // about, and an absence stated of that name was never established.
    const result = await runGetItem(
      fakeClient(),
      recordArgs({ identifier: "archive:voyageofthecormorant\u000100pell" }),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("voyageofthecormorant00pell");
  });
});

describe("terms of reuse", () => {
  it("are stated on the record they came from", async () => {
    const payload = payloadOf<{ item: { rights: { statement: string | null; note: string } } }>(
      await runGetItem(
        fakeClient({ loc: { record: locRecordWithTerms } }),
        recordArgs({ identifier: "loc:2011000002" }),
      ),
    );
    expect(payload.item.rights.statement).toBe("No known restrictions on publication.");
    expect(payload.item.rights.note).toMatch(/cover this record and no other/);
  });

  it("read a record stating none as a record that granted nothing", async () => {
    const payload = payloadOf<{ item: { rights: { note: string } } }>(
      await runGetItem(
        fakeClient({ archive: { record: archiveRecordWithoutTerms } }),
        recordArgs({ identifier: "archive:cormorantlecture1904" }),
      ),
    );
    expect(payload.item.rights.note).toMatch(/silence here is silence/);
    expect(payload.item.rights.note).toMatch(/not a grant/);
  });

  it("are never summarised for a list of results", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    expect(text).not.toMatch(/these (records|results) are (in the )?public domain/i);
    expect(text).toMatch(/A catalogue row states no terms of reuse/);
  });
});

describe("machine-read text", () => {
  it("is presented as what a scanner read", async () => {
    const payload = await inside();
    expect(payload.notes.join(" ")).toMatch(/optical recognition/);
  });

  it("is not described where an answer carries none", async () => {
    const payload = payloadOf<InsidePayload>(
      await runSearchInside(
        fakeClient({
          archive: { insideHits: [] },
          loc: { insideHits: [{ ...locInsideHits[0]!, excerpts: [] }] },
        }),
        insideArgs(),
      ),
    );

    expect(payload.hits.length).toBe(1);
    expect(payload.excerpt_kinds).toEqual({ passage: 0, page_opening: 0 });
    expect(payload.notes.join(" ")).not.toMatch(/optical recognition/);
  });

  it("is named as absent on a match that came back with none", async () => {
    const result = await runSearchInside(
      fakeClient({
        archive: { insideHits: [] },
        loc: { insideHits: [{ ...locInsideHits[0]!, excerpts: [] }] },
      }),
      insideArgs(),
    );
    const payload = payloadOf<InsidePayload>(result);

    expect(payload.notes.join(" ")).toMatch(/no machine-read text/);
    expect(textOf(result)).toMatch(/no machine-read text/);
  });
});

describe("a bundled document", () => {
  it("names what actually holds the passage", async () => {
    const payload = payloadOf<{
      hits: Array<{ inside_container: boolean; matched_file: string | null }>;
      notes: string[];
    }>(await runSearchInside(fakeClient(), insideArgs()));

    const bundled = payload.hits.find((hit) => hit.inside_container);
    expect(bundled?.matched_file).toBe("harbourpapers1883_002.txt");
    expect(payload.notes.join(" ")).toMatch(/describe the container/);
  });
});
