/**
 * What each tool returns when everything works.
 *
 * The shape is the interface: a caller reads these fields and nothing else, so
 * what they carry, what they leave null and what they say about themselves is
 * checked here the way an argument would be.
 */

import { describe, expect, it } from "vitest";
import { pageProse, rightsNote, runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  archiveInsideHits,
  archiveRecord,
  fakeClient,
  insideArgs,
  itemArgs,
  locRecord,
  payloadOf,
  recordArgs,
  textOf,
} from "./support.js";

describe("search_inside", () => {
  it("returns matches from every archive that answered", async () => {
    const payload = payloadOf<{ hits: Array<{ source: string }>; hit_count: number }>(
      await runSearchInside(fakeClient(), insideArgs()),
    );
    expect(payload.hit_count).toBe(4);
    expect(new Set(payload.hits.map((hit) => hit.source))).toEqual(new Set(["archive", "loc"]));
  });

  it("says what each archive's full-text index reads", async () => {
    const payload = payloadOf<{ per_source: Array<{ corpus: string | null }> }>(
      await runSearchInside(fakeClient(), insideArgs()),
    );
    const corpora = payload.per_source.map((report) => report.corpus ?? "").join(" ");
    expect(corpora).toMatch(/digitised books/);
    expect(corpora).toMatch(/newspapers/);
  });

  it("says the answer is the two corpora put together", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchInside(fakeClient(), insideArgs()),
    );
    expect(payload.notes.join(" ")).toMatch(/put together/);
  });

  it("keeps a passage inside the budget it was given", async () => {
    const payload = payloadOf<{ hits: Array<{ excerpts: string[] }> }>(
      await runSearchInside(fakeClient(), insideArgs({ max_excerpt_chars: 40 })),
    );
    for (const hit of payload.hits) {
      for (const excerpt of hit.excerpts) {
        expect(excerpt.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it("keeps no more passages per match than were asked for", async () => {
    const payload = payloadOf<{ hits: Array<{ excerpts: string[] }> }>(
      await runSearchInside(fakeClient(), insideArgs({ max_excerpts_per_match: 1 })),
    );
    for (const hit of payload.hits) {
      expect(hit.excerpts.length).toBeLessThanOrEqual(1);
    }
  });

  it("says more matches follow when an archive reported more than it sent", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchInside(fakeClient(), insideArgs({ page: 2 })),
    );
    expect(payload.notes.join(" ")).toMatch(/Ask for page 3 to continue/);
  });

  it("takes no more from one archive than the limit allows", async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...archiveInsideHits[0]!,
      identifier: `voyage-${index}`,
    }));
    const payload = payloadOf<{ hits: Array<{ source: string }> }>(
      await runSearchInside(
        fakeClient({ archive: { insideHits: many } }),
        insideArgs({ limit: 3 }),
      ),
    );
    expect(payload.hits.filter((hit) => hit.source === "archive")).toHaveLength(3);
  });

  it("carries the address of every match the text block shows", async () => {
    const result = await runSearchInside(fakeClient(), insideArgs());
    const text = textOf(result);
    const payload = payloadOf<{ hits: Array<{ id: string; source_url: string }> }>(result);

    // A match the block names is a match a reader can check and cite: the
    // block drops whole matches rather than cutting one in half and losing
    // the address with the tail.
    for (const hit of payload.hits) {
      if (!text.includes(`id: ${hit.id}`)) {
        continue;
      }
      expect(text, hit.id).toContain(hit.source_url);
    }
    expect(text).toContain("https://archive.org/details/voyageofthecormorant00pell");
  });

  it("says how many matches the text block left to the structured output", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      ...archiveInsideHits[0]!,
      identifier: `voyage-${index}`,
    }));
    const result = await runSearchInside(
      fakeClient({ archive: { insideHits: many } }),
      insideArgs({ limit: 20 }),
    );
    const text = textOf(result);

    expect(text).toMatch(/further match\(es\) are in the structured output/);
    expect(text).not.toContain("[shortened;");
  });
});

describe("search_items", () => {
  it("returns rows from every archive that answered", async () => {
    const payload = payloadOf<{ items: Array<{ source: string }>; item_count: number }>(
      await runSearchItems(fakeClient(), itemArgs()),
    );
    expect(payload.item_count).toBe(6);
  });

  it("carries the identifier the next call takes on every row", async () => {
    const payload = payloadOf<{ items: Array<{ id: string; source_url: string }> }>(
      await runSearchItems(fakeClient(), itemArgs()),
    );
    for (const row of payload.items) {
      expect(row.id).toMatch(/^(archive|loc|bnf):/);
      expect(row.source_url.startsWith("https://")).toBe(true);
    }
  });

  it("keeps a count of downloads null on an archive that counts none", async () => {
    const payload = payloadOf<{ items: Array<{ source: string; downloads: number | null }> }>(
      await runSearchItems(fakeClient(), itemArgs()),
    );
    const fromLoc = payload.items.filter((row) => row.source === "loc");
    for (const row of fromLoc) {
      expect(row.downloads).toBeNull();
    }
  });

  it("says which rows have no copy that can be read online", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    expect(text).toContain("no copy online");
  });
});

describe("get_item", () => {
  it("reads the record the identifier names", async () => {
    const payload = payloadOf<{ item: { title: string; source: string; identifier: string } }>(
      await runGetItem(
        fakeClient(),
        recordArgs({ identifier: "archive:voyageofthecormorant00pell" }),
      ),
    );
    expect(payload.item.source).toBe("archive");
    expect(payload.item.title).toBe(archiveRecord.title);
  });

  it("returns terms of reuse whatever sections were asked for", async () => {
    const payload = payloadOf<{ item: { rights: { url: string | null } } }>(
      await runGetItem(
        fakeClient(),
        recordArgs({ identifier: "archive:voyageofthecormorant00pell", sections: [] }),
      ),
    );
    expect(payload.item.rights.url).toBe(archiveRecord.licenseUrl);
  });

  it("names the sections nobody asked for", async () => {
    const payload = payloadOf<{ sections_omitted: string[]; sections_returned: string[] }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );
    expect(payload.sections_returned).toEqual(["description"]);
    expect(payload.sections_omitted).toEqual(["subjects", "copies", "context"]);
  });

  it("tells a field nobody asked for apart from a field the archive never fills", async () => {
    const payload = payloadOf<{
      fields_not_read_from_this_archive: string[];
      notes: string[];
    }>(
      await runGetItem(
        fakeClient(),
        recordArgs({
          identifier: "archive:voyageofthecormorant00pell",
          sections: ["description", "subjects"],
        }),
      ),
    );
    expect(payload.fields_not_read_from_this_archive).toEqual(["notes"]);
    expect(payload.notes.join(" ")).toMatch(/reads nothing into notes from the Internet Archive/);
  });

  it("returns the copies a record holds once they are asked for", async () => {
    const payload = payloadOf<{
      item: { copies: unknown[]; copies_available: number; generated_entries: number };
    }>(
      await runGetItem(
        fakeClient(),
        recordArgs({
          identifier: "archive:voyageofthecormorant00pell",
          sections: ["copies"],
        }),
      ),
    );
    // The Archive's own bookkeeping entry is not a copy of the work.
    expect(payload.item.copies).toHaveLength(2);
    expect(payload.item.copies_available).toBe(2);
    expect(payload.item.generated_entries).toBe(2);
  });

  it("keeps an archive's further prose apart from its description", async () => {
    const payload = payloadOf<{ item: { description: string | null; notes: string[] } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );
    expect(payload.item.description).toBe(locRecord.description);
    expect(payload.item.notes).toEqual(locRecord.notes);
  });

  it("reads subjects off the metadata an archive publishes them in", async () => {
    const payload = payloadOf<{ item: { subjects: string[] } }>(
      await runGetItem(
        fakeClient(),
        recordArgs({
          identifier: "archive:voyageofthecormorant00pell",
          sections: ["subjects"],
        }),
      ),
    );
    expect(payload.item.subjects).toEqual(["voyages and travels", "harbours"]);
  });

  it("names what it set aside, so a count here can be squared with the archive's page", async () => {
    const result = await runGetItem(
      fakeClient(),
      recordArgs({ identifier: "archive:voyageofthecormorant00pell", sections: ["copies"] }),
    );
    expect(textOf(result)).toMatch(
      /lists 2 further entries against this record that are not copies of the thing/,
    );
  });

  it("says what a year on this archive was measured on", async () => {
    const payload = payloadOf<{ item: { year_means: string } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );
    expect(payload.item.year_means).toMatch(/catalogue record/);
  });

  it("says what an archive files under the field this server reads as a description", async () => {
    // A field called description holds an account of the thing on one record
    // and the place it was published on the next, and both arrive here as the
    // record's prose. What the field is has to travel with what it holds.
    const payload = payloadOf<{ item: { description_means: string | null }; notes: string[] }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );

    expect(payload.item.description_means).toMatch(/\w/);
    expect(payload.notes.join(" ")).toContain(payload.item.description_means!);
  });

  it("says nothing of the kind on an archive it reads no description from", async () => {
    const payload = payloadOf<{ item: { description_means: string | null } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "bnf:cb11940100c" })),
    );
    expect(payload.item.description_means).toBeNull();
  });
});

describe("prose that pages", () => {
  const prose = ["First paragraph about the voyage.", "Second paragraph about the harbour."].join(
    "\n\n",
  );

  it("returns the whole of a short body and offers no resumption", () => {
    const window = pageProse(prose, 0, 1000);
    expect(window.text).toBe(prose);
    expect(window.nextOffset).toBeNull();
  });

  it("resumes at a line boundary rather than mid-word", () => {
    const window = pageProse(prose, 0, 40);
    expect(window.text).toBe("First paragraph about the voyage.");
    expect(prose[window.nextOffset! - 1]).toBe("\n");
  });

  it("continues from the offset it handed back", () => {
    const first = pageProse(prose, 0, 40);
    const second = pageProse(prose, first.nextOffset!, 1000);
    expect(second.text).toBe("Second paragraph about the harbour.");
    expect(second.nextOffset).toBeNull();
  });

  it("says an offset is past the end rather than answering with nothing", () => {
    const window = pageProse(prose, 9999, 100);
    expect(window.pastEnd).toBe(true);
    expect(window.totalChars).toBe(prose.length);
  });

  it("reports no window at all on a record with nothing written about it", () => {
    const window = pageProse("", 0, 100);
    expect(window.pastEnd).toBe(false);
    expect(window.totalChars).toBe(0);
  });

  it("says where to resume, in the answer", async () => {
    const long = { ...locRecord, description: "word ".repeat(400).trim() };
    const payload = payloadOf<{ notes: string[]; text_window: { next_offset: number | null } }>(
      await runGetItem(
        fakeClient({ loc: { record: long } }),
        recordArgs({ identifier: "loc:2011000001", max_text_chars: 300 }),
      ),
    );
    expect(payload.text_window.next_offset).not.toBeNull();
    expect(payload.notes.join(" ")).toMatch(/Ask again with text_offset/);
  });
});

describe("what one record says about reuse", () => {
  it("reports terms and their address together", () => {
    expect(
      rightsNote({ statement: "Public domain.", url: "https://x.invalid" }, "an archive"),
    ).toMatch(/Public domain\. \(https:\/\/x\.invalid\)/);
  });

  it("reports an address alone as an address", () => {
    expect(rightsNote({ statement: null, url: "https://x.invalid" }, "an archive")).toMatch(
      /points at https:\/\/x\.invalid/,
    );
  });

  it("reads silence as silence", () => {
    const note = rightsNote({ statement: null, url: null }, "an archive");
    expect(note).toMatch(/states no terms of reuse/);
    expect(note).toMatch(/says nothing about any other record/);
  });
});
