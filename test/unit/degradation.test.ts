/**
 * What an answer says when an archive misbehaves, and how it stays bounded.
 *
 * An archive can be slow, unreachable, rate limiting, or answering in a shape
 * this server cannot read, and each of those is a different statement about the
 * world. The moment that failed is part of the statement: a search that never
 * answered and a search that answered before the read failed are two different
 * things, and a report naming only one of them tells a reader something that
 * did not happen.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";
import { MAX_BLOCK_CHARS, ok } from "../../src/tools/shared.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  FakeSourceError,
  archiveItemRows,
  fakeArchive,
  fakeBnf,
  fakeClient,
  fakeLoc,
  insideArgs,
  itemArgs,
  payloadOf,
  recordArgs,
  reportFor,
  silentLogger,
  textOf,
} from "./support.js";

interface Reports {
  per_source: Array<{ source: string; status: string; stage: string | null; skipped: number }>;
  notes: string[];
}

describe("a search that never answered", () => {
  it("names the archive, the code and the moment", async () => {
    const payload = payloadOf<Reports>(
      await runSearchInside(
        fakeClient({ archive: { fail: new FakeSourceError("network_error", "No route.") } }),
        insideArgs(),
      ),
    );

    expect(reportFor(payload, "archive").status).toBe("failed");
    expect(reportFor(payload, "archive").stage).toBe("search");
    expect(payload.notes.join(" ")).toMatch(/its search did not answer/);
    expect(payload.notes.join(" ")).toMatch(/network_error/);
  });

  it("says the rest of the answer is no evidence about what it holds", async () => {
    const payload = payloadOf<Reports>(
      await runSearchInside(
        fakeClient({ archive: { fail: new FakeSourceError("timeout", "Too slow.") } }),
        insideArgs(),
      ),
    );
    expect(payload.notes.join(" ")).toMatch(/says nothing about what the Internet Archive holds/);
  });

  it("still returns what the other archives found", async () => {
    const payload = payloadOf<{ hits: Array<{ source: string }> }>(
      await runSearchInside(
        fakeClient({ archive: { fail: new FakeSourceError("timeout", "Too slow.") } }),
        insideArgs(),
      ),
    );
    expect(payload.hits.length).toBeGreaterThan(0);
    expect(new Set(payload.hits.map((hit) => hit.source))).toEqual(new Set(["loc"]));
  });
});

describe("a read that failed after its archive was named by an identifier", () => {
  it("names the archive and the moment in the error", async () => {
    const result = await runGetItem(
      fakeClient({ loc: { failRecord: new FakeSourceError("not_found", "No such record.") } }),
      recordArgs({ identifier: "loc:2011000001" }),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[not_found]");
    expect(textOf(result)).toMatch(/the Library of Congress was asked for "2011000001"/);
    expect(textOf(result)).toMatch(/the read failed/);
  });

  it("never says a search did not answer, because no search happened", async () => {
    const result = await runGetItem(
      fakeClient({ loc: { failRecord: new FakeSourceError("not_found", "No such record.") } }),
      recordArgs({ identifier: "loc:2011000001" }),
    );
    expect(textOf(result)).not.toMatch(/search did not answer/);
  });

  it("reports the read as the moment when it succeeded too", async () => {
    const payload = payloadOf<{ item: { source: string } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );
    expect(payload.item.source).toBe("loc");
  });
});

describe("when nothing answered at all", () => {
  const bothDown = () =>
    fakeClient({
      archive: { fail: new FakeSourceError("rate_limited", "Slow down.") },
      loc: { fail: new FakeSourceError("rate_limited", "Slow down.") },
    });

  it("does not open with a sentence that reads as an absence", async () => {
    const text = textOf(await runSearchInside(bothDown(), insideArgs()));
    expect(text).not.toMatch(/^Nothing came back/);
    expect(text).toMatch(/No archive answered/);
  });

  it("does not claim another archive found something when none did", async () => {
    const text = textOf(await runSearchInside(bothDown(), insideArgs()));
    expect(text).not.toMatch(/holds what the other archives found/);
  });

  it("does not promise another archive when only one was asked", async () => {
    const text = textOf(
      await runSearchInside(
        fakeClient({ archive: { fail: new FakeSourceError("timeout", "too slow") } }),
        insideArgs({ sources: ["archive"] }),
      ),
    );
    expect(text).not.toMatch(/holds what the other archives found/);
  });

  it("credits no archive when none contributed", async () => {
    const text = textOf(await runSearchInside(bothDown(), insideArgs()));
    expect(text.split("\n").at(-1)).toBe("No archive contributed to this answer.");
  });
});

describe("an answer holding no row because no row could be read", () => {
  it("never calls a decoding failure an absence, nor blames the wording for it", async () => {
    const payload = payloadOf<Reports>(
      await runSearchItems(
        fakeClient({
          // Rows the archive did send, in a shape this server cannot read.
          archive: { rows: [{ title: "a row with no identifier" }] as typeof archiveItemRows },
          loc: { rows: [] },
          bnf: { rows: [] },
        }),
        itemArgs(),
      ),
    );
    const notes = payload.notes.join(" ");

    expect(reportFor(payload, "archive").skipped).toBeGreaterThan(0);
    expect(notes).not.toMatch(/none holds anything under this wording/);
    expect(notes).not.toMatch(/Try fewer words/);
    expect(notes).toMatch(/could not read/);
  });

  it("still says every archive holds nothing when every archive read cleanly", async () => {
    const payload = payloadOf<Reports>(
      await runSearchItems(
        fakeClient({
          archive: { rows: [], itemTotal: 0 },
          loc: { rows: [], itemTotal: 0 },
          bnf: { rows: [] },
        }),
        itemArgs(),
      ),
    );
    expect(payload.notes.join(" ")).toMatch(/none holds anything under this wording/);
  });
});

describe("a page past the last one an archive filled", () => {
  it("blames the page rather than the words, on the catalogue", async () => {
    const payload = payloadOf<Reports>(
      await runSearchItems(
        fakeClient({ archive: { rows: [] }, loc: { rows: [] }, bnf: { rows: [] } }),
        itemArgs({ page: 40 }),
      ),
    );
    const notes = payload.notes.join(" ");

    expect(notes).not.toMatch(/none holds anything under this wording/);
    expect(notes).not.toMatch(/statement about the wording/);
    expect(notes).toMatch(/page 40/);
  });

  it("blames the page rather than the words, on the scanned text", async () => {
    const payload = payloadOf<Reports>(
      await runSearchInside(
        fakeClient({ archive: { insideHits: [] }, loc: { insideHits: [] } }),
        insideArgs({ page: 40 }),
      ),
    );
    const notes = payload.notes.join(" ");

    expect(notes).not.toMatch(/statement about the wording/);
    expect(notes).toMatch(/page 40/);
  });

  it("still blames the words on the first page, where the page is not the reason", async () => {
    const payload = payloadOf<Reports>(
      await runSearchItems(
        fakeClient({ archive: { rows: [] }, loc: { rows: [] }, bnf: { rows: [] } }),
        itemArgs({ page: 1 }),
      ),
    );

    expect(payload.notes.join(" ")).toMatch(/wording/);
  });
});

describe("an archive that answered and holds nothing", () => {
  it("is told apart from one that failed", async () => {
    const payload = payloadOf<Reports>(
      await runSearchInside(
        fakeClient({ archive: { insideHits: [], insideTotal: 0 } }),
        insideArgs(),
      ),
    );

    expect(reportFor(payload, "archive").status).toBe("answered");
    expect(payload.notes.join(" ")).toMatch(/the Internet Archive answered and offered nothing/);
  });
});

describe("a row an archive sent in a shape this server cannot read", () => {
  it("drops that row and keeps the rest of the answer", async () => {
    const rows = [
      { ...archiveItemRows[0]!, identifier: undefined as unknown as string },
      archiveItemRows[1]!,
    ];
    const payload = payloadOf<Reports & { items: Array<{ source: string }> }>(
      await runSearchItems(fakeClient({ archive: { rows } }), itemArgs()),
    );

    expect(payload.items.filter((row) => row.source === "archive")).toHaveLength(1);
    expect(reportFor(payload, "archive").skipped).toBe(1);
  });

  it("says the archive's own count still counts what was dropped", async () => {
    const rows = [
      { ...archiveItemRows[0]!, identifier: undefined as unknown as string },
      archiveItemRows[1]!,
    ];
    const payload = payloadOf<Reports>(
      await runSearchItems(fakeClient({ archive: { rows } }), itemArgs()),
    );
    expect(payload.notes.join(" ")).toMatch(/Its own count above still counts them/);
  });

  it("reports a payload with no list at all as unreadable rather than empty", async () => {
    const broken = {
      ...fakeArchive(),
      async searchItems() {
        return { data: {} as never, cached: false };
      },
    };
    const client = new BooksClient({
      logger: silentLogger,
      readers: { archive: broken, loc: fakeLoc(), bnf: fakeBnf() },
    });

    const payload = payloadOf<Reports>(await runSearchItems(client, itemArgs()));
    expect(reportFor(payload, "archive").status).toBe("failed");
    expect(payload.notes.join(" ")).toMatch(/parse_failure/);
  });
});

describe("a record an archive sent in a shape this server cannot read", () => {
  it("is reported as unreadable rather than as a network failure", async () => {
    const broken = {
      ...fakeArchive(),
      async getItem() {
        return { data: { identifier: "x" } as never, cached: false };
      },
    };
    const client = new BooksClient({
      logger: silentLogger,
      readers: { archive: broken, loc: fakeLoc(), bnf: fakeBnf() },
    });

    await expect(client.getItem("archive:x")).rejects.toMatchObject({ code: "parse_failure" });
  });

  it("names the field that could not be read", async () => {
    const broken = {
      ...fakeArchive(),
      async getItem() {
        return { data: { identifier: "x" } as never, cached: false };
      },
    };
    const client = new BooksClient({
      logger: silentLogger,
      readers: { archive: broken, loc: fakeLoc(), bnf: fakeBnf() },
    });

    await expect(client.getItem("archive:x")).rejects.toThrow(/sourceUrl/i);
  });
});

describe("a record an archive answered about and served no whole record for", () => {
  const partial = () => ({
    ...fakeArchive(),
    async getItem() {
      return { data: { identifier: "x" } as never, cached: false };
    },
  });
  const client = () =>
    new BooksClient({
      logger: silentLogger,
      readers: { archive: partial(), loc: fakeLoc(), bnf: fakeBnf() },
    });

  it("is not handed to the caller as a defect to open a bug report about", async () => {
    // An archive answers about identifiers it serves no record of its own for,
    // and a search hands those identifiers out. Reading one is a question that
    // was answered, not a server that broke.
    const result = await runGetItem(client(), recordArgs({ identifier: "archive:x" }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toMatch(/report this at/i);
  });

  it("says the archive answered and served no whole record at that identifier", async () => {
    const result = await runGetItem(client(), recordArgs({ identifier: "archive:x" }));
    expect(textOf(result)).toMatch(/served no whole record/);
  });

  it("sends the caller to the address the row carries", async () => {
    const result = await runGetItem(client(), recordArgs({ identifier: "archive:x" }));
    expect(textOf(result)).toMatch(/source_url/);
  });
});

describe("an archive that never answers", () => {
  it("does not hold the whole call open behind it", async () => {
    const stalled = {
      searchInside: () => new Promise<never>(() => undefined),
      searchItems: () => new Promise<never>(() => undefined),
      getItem: () => new Promise<never>(() => undefined),
    };
    const client = new BooksClient({
      logger: silentLogger,
      config: { timeoutMs: 1000, maxRetries: 0 },
      readers: { archive: stalled, loc: fakeLoc(), bnf: fakeBnf() },
    });

    const merged = await client.searchInside("wet fog", {
      limit: 5,
      page: 1,
      maxExcerptChars: 300,
      maxExcerptsPerMatch: 2,
    });
    const archive = merged.reports.find((report) => report.source === "archive")!;
    expect(archive.status).toBe("failed");
    expect(archive.error?.code).toBe("timeout");
    expect(merged.hits.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("a configuration object handed to the published client", () => {
  it("cannot turn the deadline off", () => {
    const client = new BooksClient({
      config: { timeoutMs: 0 },
      readers: { archive: fakeArchive(), loc: fakeLoc(), bnf: fakeBnf() },
    });
    expect(client.timeoutMs).toBeGreaterThan(0);
  });

  it("cannot ask for a retry storm", () => {
    const client = new BooksClient({
      config: { maxRetries: 100_000 },
      readers: { archive: fakeArchive(), loc: fakeLoc(), bnf: fakeBnf() },
    });
    expect(client.maxRetries).toBeLessThanOrEqual(8);
  });

  it("cannot take an archive below the spacing that archive is owed", () => {
    const client = new BooksClient({
      config: { minIntervalMs: 1 },
      readers: { archive: fakeArchive(), loc: fakeLoc(), bnf: fakeBnf() },
    });
    const loc = client.pacing.find((entry) => entry.id === "loc")!;
    expect(loc.intervalMs).toBe(6000);
  });

  it("can widen the spacing of every archive at once", () => {
    const client = new BooksClient({
      config: { minIntervalMs: 9000 },
      readers: { archive: fakeArchive(), loc: fakeLoc(), bnf: fakeBnf() },
    });
    for (const entry of client.pacing) expect(entry.intervalMs).toBe(9000);
  });

  it("keeps the project's own identifier in a User-Agent a caller replaced", () => {
    const client = new BooksClient({
      config: { userAgent: "somebody-else/1.0" },
      readers: { archive: fakeArchive(), loc: fakeLoc(), bnf: fakeBnf() },
    });
    expect(client.userAgent).toContain("mcp-books/");
    expect(client.userAgent).toContain("somebody-else/1.0");
  });
});

describe("an answer that has more to say than it has room for", () => {
  it("keeps a failure note when the notes have to be cut", () => {
    const notes = [
      ...Array.from({ length: 80 }, (_, index) => `a detail worth knowing, number ${index}`),
      "the Internet Archive was asked and its search did not answer (timeout): it took too long.",
    ];
    const text = textOf(ok({}, "the answer", { notes }));
    expect(text).toContain("its search did not answer");
    expect(text.length).toBeLessThanOrEqual(MAX_BLOCK_CHARS);
  });

  it("keeps the note about openings of pages", () => {
    const notes = [
      ...Array.from({ length: 80 }, (_, index) => `a detail worth knowing, number ${index}`),
      "3 of the 9 excerpts here are the opening of a page rather than the passage that matched.",
    ];
    expect(textOf(ok({}, "the answer", { notes }))).toContain("opening of a page");
  });

  it("keeps a note about terms of reuse", () => {
    const notes = [
      ...Array.from({ length: 80 }, (_, index) => `a detail worth knowing, number ${index}`),
      "This record states no terms of reuse, and silence is not a grant.",
    ];
    expect(textOf(ok({}, "the answer", { notes }))).toContain("silence is not a grant");
  });
});

describe("the credit names the archives that actually contributed", () => {
  it("drops an archive that answered nothing from the credit line", async () => {
    const text = textOf(
      await runSearchInside(
        fakeClient({ archive: { fail: new FakeSourceError("timeout", "too slow") } }),
        insideArgs(),
      ),
    );
    const credit = text.split("\n").at(-1)!;
    expect(credit).toContain("Library of Congress");
    expect(credit).not.toContain("Internet Archive");
  });
});
