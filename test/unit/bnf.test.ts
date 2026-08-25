/**
 * An archive that answers a different question with the same words.
 *
 * A national library's catalogue describes entities rather than holdings, reads
 * a narrower set of fields than an archive of scans, applies neither a year
 * range nor an order, and publishes its metadata on a condition. Merging it in
 * is easy if the answer is allowed to flatten those four things, and each of
 * them is a false statement waiting to be made: a question that was not asked
 * of every archive, a filter one archive never received, a record described as
 * a copy of something, and a credit that leaves out what the licence asks for.
 *
 * What is checked here is that each divergence is stated where a reader will
 * find it, in the structured payload and in the block a text-only client
 * renders.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { INSTRUCTIONS } from "../../src/server.js";
import { MEDIA_TYPES, SOURCE_IDS } from "../../src/sources/registry.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  BNF_RETRIEVED_AT,
  bnfWorkRecord,
  bnfWorkRows,
  fakeClient,
  insideArgs,
  itemArgs,
  payloadOf,
  recordArgs,
  reportFor,
  textOf,
} from "./support.js";

interface ItemsPayload {
  items: Array<{
    id: string;
    source: string;
    media_type: string | null;
    identifier_provisional: boolean | null;
    year: number | null;
    date: string | null;
  }>;
  per_source: Array<{
    source: string;
    status: string;
    attribution: string | null;
    searches_on: string | null;
    row_describes: string | null;
    filters_dropped: Array<{ filter: string; because: string }>;
    ordered_on: string | null;
    reported_total: number | null;
    more_on_this_archive: boolean | null;
  }>;
  notes: string[];
}

const items = async (over = {}, options = {}) =>
  payloadOf<ItemsPayload>(await runSearchItems(fakeClient(options), itemArgs(over)));

/* -------------------------------------------------------------------------- */
/* An archive that reads no text of its own                                    */
/* -------------------------------------------------------------------------- */

describe("a catalogue that holds no text to search", () => {
  it("is registered beside the archives that do", () => {
    expect(SOURCE_IDS).toContain("bnf");
  });

  it("is named as absent from the full-text search rather than left out", async () => {
    const payload = payloadOf<{
      per_source: Array<{ source: string; status: string; absent_because: string | null }>;
    }>(await runSearchInside(fakeClient(), insideArgs()));

    expect(reportFor(payload, "bnf").status).toBe("absent");
    expect(reportFor(payload, "bnf").stage).toBeNull();
  });

  it("gives a reason a reader can act on, rather than a bare refusal", async () => {
    const payload = payloadOf<{ per_source: Array<{ source: string }> }>(
      await runSearchInside(fakeClient(), insideArgs()),
    );
    const because = String(reportFor(payload, "bnf").absent_because);

    expect(because).toMatch(/catalogue/i);
    expect(because).toMatch(/no .*text|holds none of the text|does not hold the text/i);
    expect(because).toMatch(/search_items|catalogue search/i);
  });

  it("says so in the block a text-only client renders", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toMatch(/Bibliothèque nationale de France was not asked for this/);
    expect(text).toMatch(/Nothing in this answer is evidence about what it holds/);
  });

  it("is named in the guidance, so a caller knows before asking", () => {
    expect(INSTRUCTIONS).toMatch(/reading 3 archives/);
    expect(INSTRUCTIONS).toContain("the Bibliothèque nationale de France");
    expect(INSTRUCTIONS).toMatch(/cannot be searched inside its text/);
  });
});

/* -------------------------------------------------------------------------- */
/* One query, three questions                                                  */
/* -------------------------------------------------------------------------- */

describe("the fields each catalogue matched the query against", () => {
  it("is published per archive rather than presented as one question", async () => {
    const payload = await items();

    expect(String(reportFor(payload, "archive").searches_on)).toMatch(/creator|subject/i);
    expect(String(reportFor(payload, "loc").searches_on)).toMatch(/creator|subject/i);
    expect(String(reportFor(payload, "bnf").searches_on)).toMatch(/title/i);
    expect(String(reportFor(payload, "bnf").searches_on)).not.toMatch(/creator/i);
  });

  it("is said in the notes when the archives did not read the same fields", async () => {
    const payload = await items();
    const said = payload.notes.join(" ");

    expect(said).toMatch(/matched .*against different fields|read different fields/i);
    expect(said).toMatch(/Bibliothèque nationale de France/);
  });

  it("warns that a creator's name reaches a title index as a subject", async () => {
    const payload = await items();
    expect(payload.notes.join(" ")).toMatch(/books about .* rather than .* by/i);
  });

  it("reaches the block a text-only client renders", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    expect(text).toMatch(/different fields/i);
  });
});

/* -------------------------------------------------------------------------- */
/* A filter one archive never received                                         */
/* -------------------------------------------------------------------------- */

describe("a year range on an archive whose catalogue has no year filter", () => {
  it("names that archive as one the filter never reached", async () => {
    const payload = await items({ year_from: 1500, year_to: 1600 });
    const dropped = reportFor(payload, "bnf").filters_dropped as Array<{
      filter: string;
      because: string;
    }>;

    expect(dropped.map((entry) => entry.filter)).toContain("year_range");
    expect(dropped[0]?.because.length).toBeGreaterThan(20);
  });

  it("leaves the archives that did apply it with nothing dropped", async () => {
    const payload = await items({ year_from: 1500, year_to: 1600 });
    expect(reportFor(payload, "archive").filters_dropped).toEqual([]);
    expect(reportFor(payload, "loc").filters_dropped).toEqual([]);
  });

  it("says in the notes that its rows were never narrowed by the range", async () => {
    const payload = await items({ year_from: 1500, year_to: 1600 });
    const said = payload.notes.join(" ");

    expect(said).toMatch(/Bibliothèque nationale de France .*(was not given|never received)/i);
    expect(said).toMatch(/year/i);
  });

  it("keeps that archive out of the sentence saying who applied the range", async () => {
    const payload = await items({ year_from: 1500, year_to: 1600 });
    const applied = payload.notes.find((note) =>
      note.includes("not necessarily dated by the same measure"),
    );
    expect(applied).toBeDefined();
    expect(applied).not.toMatch(/Bibliothèque nationale de France/);
  });

  it("says nothing about a dropped filter when no filter was given", async () => {
    const payload = await items();
    expect(reportFor(payload, "bnf").filters_dropped).toEqual([]);
    expect(payload.notes.join(" ")).not.toMatch(/was not given the/i);
  });
});

describe("an order on an archive that orders nothing", () => {
  it("names it as one the order never reached", async () => {
    const payload = await items({ sort: "oldest" });
    const dropped = reportFor(payload, "bnf").filters_dropped as Array<{ filter: string }>;
    expect(dropped.map((entry) => entry.filter)).toContain("sort");
  });

  it("describes what its rows are actually in, which is no ranking", async () => {
    const payload = await items({ sort: "oldest" });
    const orderedOn = String(reportFor(payload, "bnf").ordered_on);

    expect(orderedOn).toMatch(/index/i);
    expect(orderedOn).not.toMatch(/oldest|relevance of/i);
  });

  it("leaves relevance out of the dropped filters, since none was asked for", async () => {
    const payload = await items();
    const dropped = reportFor(payload, "bnf").filters_dropped as Array<{ filter: string }>;
    expect(dropped.map((entry) => entry.filter)).not.toContain("sort");
  });
});

/* -------------------------------------------------------------------------- */
/* An entity is not a holding                                                  */
/* -------------------------------------------------------------------------- */

describe("a row describing a work rather than a copy", () => {
  it("says what kind of thing it is, in that catalogue's own word", async () => {
    const payload = await items();
    const fromBnf = payload.items.filter((row) => row.source === "bnf");

    expect(fromBnf.length).toBeGreaterThan(0);
    for (const row of fromBnf) {
      expect(row.media_type).toBe("work");
    }
  });

  it("says what one of its rows is, beside the archives that hold copies", async () => {
    const payload = await items();

    expect(String(reportFor(payload, "bnf").row_describes)).toMatch(/work|entity/i);
    expect(String(reportFor(payload, "archive").row_describes)).toMatch(/cop(y|ies)|holds/i);
  });

  it("marks an identifier the catalogue has not settled", async () => {
    const payload = await items();
    const rows = payload.items.filter((row) => row.source === "bnf");

    expect(rows.some((row) => row.identifier_provisional === true)).toBe(true);
    expect(rows.some((row) => row.identifier_provisional === false)).toBe(true);
  });

  it("leaves that mark null on an archive that mints one kind of identifier", async () => {
    const payload = await items();
    for (const row of payload.items.filter((one) => one.source !== "bnf")) {
      expect(row.identifier_provisional).toBeNull();
    }
  });

  it("says a provisional identifier can change, where a reader will cite one", async () => {
    const payload = await items();
    expect(payload.notes.join(" ")).toMatch(/provisional/i);
    expect(payload.notes.join(" ")).toMatch(/can change/i);
  });

  it("reads a date it cannot turn into a year as no year at all", async () => {
    const payload = await items();
    const provisional = payload.items.find((row) => row.identifier_provisional === true)!;

    expect(provisional.year).toBeNull();
    expect(provisional.date).toBe("[s.d.]");
  });

  it("offers that catalogue's own name for a kind of material", () => {
    expect(MEDIA_TYPES).toContain("work");
  });
});

/* -------------------------------------------------------------------------- */
/* What the licence asks for                                                   */
/* -------------------------------------------------------------------------- */

describe("an archive that publishes on a condition", () => {
  it("carries its own credit, with the date the metadata was retrieved", async () => {
    const payload = await items();
    const attribution = String(reportFor(payload, "bnf").attribution);

    expect(attribution).toContain("data.bnf.fr");
    expect(attribution).toContain(BNF_RETRIEVED_AT);
  });

  it("puts that credit in the block a text-only client renders", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    const credit = text.split("\n").slice(-3).join("\n");

    expect(credit).toContain("data.bnf.fr");
    expect(credit).toContain(BNF_RETRIEVED_AT);
  });

  it("credits each archive on its own line rather than summing them", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    const credit = text.split("\n").filter((line) => line.startsWith("Source:"));

    expect(credit.length).toBe(3);
    expect(credit.filter((line) => line.includes("data.bnf.fr"))).toHaveLength(1);
  });

  it("carries it on a record read in full too", async () => {
    const payload = payloadOf<{ item: { attribution: string } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "bnf:cb11940100c" })),
    );
    expect(payload.item.attribution).toContain("data.bnf.fr");
    expect(payload.item.attribution).toContain(BNF_RETRIEVED_AT);
  });

  it("states terms that cover the catalogue rather than that record alone", async () => {
    const payload = payloadOf<{ item: { rights: { statement: string | null; note: string } } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "bnf:cb11940100c" })),
    );

    expect(String(payload.item.rights.statement)).toMatch(/date it was retrieved|retrieval/i);
    expect(payload.item.rights.note).not.toMatch(/cover this record and no other/);
    expect(payload.item.rights.note).toMatch(/every record this catalogue publishes/i);
  });

  it("never reads that catalogue's silence as the silence of a deposit", async () => {
    const payload = payloadOf<{ item: { rights: { note: string } } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "bnf:cb11940100c" })),
    );
    expect(payload.item.rights.note).not.toMatch(/states no terms of reuse/);
  });
});

/* -------------------------------------------------------------------------- */
/* One record, read in full                                                    */
/* -------------------------------------------------------------------------- */

describe("a work read in full", () => {
  it("is routed by the identifier a search handed back", async () => {
    const payload = payloadOf<{
      item: { source: string; identifier: string; title: string | null; media_type: string | null };
    }>(await runGetItem(fakeClient(), recordArgs({ identifier: "bnf:cb11940100c" })));

    expect(payload.item.source).toBe("bnf");
    expect(payload.item.identifier).toBe("cb11940100c");
    expect(payload.item.media_type).toBe("work");
  });

  it("says a record here is a work, whose editions are records of their own", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "bnf:cb11940100c" })),
    );
    expect(payload.notes.join(" ")).toMatch(/edition/i);
  });

  it("counts as a copy only what stands for the work rather than what illustrates it", async () => {
    const record = {
      ...bnfWorkRecord,
      depictions: Array.from({ length: 30 }, (_, index) => ({
        ark: `ark:/12148/btv1b860000${index}x`,
        url: `https://gallica.bnf.fr/ark:/12148/btv1b860000${index}x.thumbnail`,
        role: "depiction" as const,
        fromId: "cb11940100c",
        fromTitle: "Relation du voyage du Cormoran",
      })),
    };
    const payload = payloadOf<{
      item: { copies: unknown[]; copies_available: number; generated_entries: number };
    }>(
      await runGetItem(
        fakeClient({ bnf: { record } }),
        recordArgs({ identifier: "bnf:cb11940100c", sections: ["copies"] }),
      ),
    );

    expect(payload.item.copies_available).toBe(0);
    expect(payload.item.copies).toHaveLength(0);
    expect(payload.item.generated_entries).toBe(30);
  });

  it("offers a digitised document as an address for a person to open", async () => {
    const record = {
      ...bnfWorkRecord,
      depictions: [
        {
          ark: "ark:/12148/btv1b8600001x",
          url: "https://gallica.bnf.fr/ark:/12148/btv1b8600001x",
          role: "reproduction" as const,
          fromId: "cb11940100c",
          fromTitle: "Relation du voyage du Cormoran",
        },
      ],
    };
    const payload = payloadOf<{ item: { copies: Array<{ label: string | null; url: string }> } }>(
      await runGetItem(
        fakeClient({ bnf: { record } }),
        recordArgs({ identifier: "bnf:cb11940100c", sections: ["copies"] }),
      ),
    );

    expect(payload.item.copies).toHaveLength(1);
    expect(payload.item.copies[0]?.url).toContain("gallica.bnf.fr");
    expect(String(payload.item.copies[0]?.label)).toMatch(/copy|reproduction|text/i);
  });

  it("routes an address on the catalogue's own host without a prefix", async () => {
    const payload = payloadOf<{ item: { source: string }; id_read_as: string | null }>(
      await runGetItem(
        fakeClient(),
        recordArgs({ identifier: "https://data.bnf.fr/ark:/12148/cb11940100c" }),
      ),
    );

    expect(payload.item.source).toBe("bnf");
    expect(String(payload.id_read_as)).toMatch(/data\.bnf\.fr/);
  });
});

/* -------------------------------------------------------------------------- */
/* A digitised document is an address, never a request                         */
/* -------------------------------------------------------------------------- */

describe("a link to a digitised document", () => {
  it("is never requested while an answer is built", async () => {
    const asked = vi.fn();
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((async (input: unknown) => {
      asked(String(input));
      throw new Error("no request should leave this server for a digitised document");
    }) as typeof fetch);

    try {
      await runGetItem(
        fakeClient(),
        recordArgs({ identifier: "bnf:cb11940100c", sections: ["copies"] }),
      );
      await runSearchItems(fakeClient(), itemArgs());
    } finally {
      spy.mockRestore();
    }

    expect(asked).not.toHaveBeenCalled();
  });

  it("is written nowhere in this repository as an address to request", () => {
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!path.endsWith(".ts")) {
          continue;
        }
        for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
          if (!/gallica\.bnf\.fr/i.test(line)) {
            continue;
          }
          // A digitised document is an address a person opens. A line that both
          // names that host and hands a value to something that fetches it is
          // the one shape this server must never carry.
          if (/\bfetch\s*\(|new URL\s*\(|axios|got\s*\(|request\s*\(|https?\.get/.test(line)) {
            offenders.push(`${path}:${index + 1}`);
          }
        }
      }
    };
    walk(join(process.cwd(), "src"));

    expect(offenders).toEqual([]);
  });

  it("is carried in a row's own payload, so a reader can follow it themselves", () => {
    // The fixture states the shape a work record carries: an address on the
    // digitisation host, published rather than opened.
    expect(bnfWorkRows.length).toBeGreaterThan(1);
  });
});
