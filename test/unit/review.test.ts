/**
 * What a caller can act on without having read the code.
 *
 * These cases come from reading the tools as a caller does: from the names, the
 * descriptions, the schemas and the text block, with nothing else. Each one is
 * a place where an answer was correct and unusable, or where a caller had to
 * guess a value the server could have named.
 */

import { describe, expect, it } from "vitest";
import { SOURCE_IDS } from "../../src/sources/registry.js";
import { INSTRUCTIONS } from "../../src/server.js";
import { getItemInput, runGetItem } from "../../src/tools/getItem.js";
import {
  runSearchInside,
  searchInsideDescription,
  searchInsideInput,
} from "../../src/tools/searchInside.js";
import { runSearchItems, searchItemsInput } from "../../src/tools/searchItems.js";
import { rowSchema } from "../../src/tools/shared.js";
import {
  archiveInsideHits,
  fakeClient,
  insideArgs,
  itemArgs,
  locInsideHits,
  payloadOf,
  recordArgs,
  reportFor,
  textOf,
} from "./support.js";

/** The sentence a schema carries for a caller who has only the schema. */
function describedIn(shape: unknown): string {
  return (shape as { description?: string }).description ?? "";
}

describe("the text block of a default search", () => {
  it("shows every match it found rather than a fraction of them", async () => {
    // A client that renders nothing else has only this block to work from, and
    // a block holding two matches out of ten answers a fifth of the question.
    const args = searchInsideInput.parse({ query: "wet fog" });
    const result = await runSearchInside(fakeClient(), args);
    const payload = payloadOf<{ hits: Array<{ id: string }> }>(result);
    const text = textOf(result);

    for (const hit of payload.hits) expect(text, hit.id).toContain(`id: ${hit.id}`);
  });

  it("keeps the sentence that says how to read further", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toMatch(/Ask for page 2 to continue/);
  });

  it("keeps every archive's own count, so neither is the only one a reader sees", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toMatch(/the Internet Archive reported \d/);
    expect(text).toMatch(/the Library of Congress reported \d/);
  });

  it("names who made the thing a match sits in", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toContain("Pellisier, Aldous");
  });
});

describe("choosing between the two searches", () => {
  it("says which question each one answers, and what the wrong choice costs", () => {
    expect(INSTRUCTIONS).toMatch(/confident empty answer/);
    expect(searchInsideDescription).toMatch(/search_items/);
  });
});

describe("an archive named by a caller", () => {
  it("is offered as a value rather than left to be guessed", () => {
    expect(() => searchInsideInput.parse({ query: "wet fog", sources: ["nobody"] })).toThrow();
    expect(() => searchItemsInput.parse({ query: "x", sources: ["nobody"] })).toThrow();
    expect(() =>
      searchInsideInput.parse({ query: "wet fog", sources: [...SOURCE_IDS] }),
    ).not.toThrow();
  });
});

describe("which archive files material under which name", () => {
  it("is written into the argument rather than learned from a failed call", () => {
    const described = describedIn(searchItemsInput.shape.media_type);
    expect(described).toContain("the Internet Archive files");
    expect(described).toContain("the Library of Congress files");
  });
});

describe("a report a caller reads to decide what to do next", () => {
  it("says whether that archive has more beyond this page", async () => {
    const payload = payloadOf<{ per_source: Array<{ source: string }> }>(
      await runSearchInside(fakeClient(), insideArgs()),
    );
    expect(reportFor(payload, "archive").more_on_this_archive).toBe(true);
  });

  it("says so of an archive that sent everything it had", async () => {
    const payload = payloadOf<{ per_source: Array<{ source: string }> }>(
      await runSearchInside(
        fakeClient({ archive: { insideHits: [archiveInsideHits[0]!], insideTotal: 1 } }),
        insideArgs(),
      ),
    );
    expect(reportFor(payload, "archive").more_on_this_archive).toBe(false);
  });

  it("leaves it unstated for an archive that was never asked", async () => {
    const payload = payloadOf<{ per_source: Array<{ source: string }> }>(
      await runSearchItems(fakeClient(), itemArgs({ media_type: "texts" })),
    );
    expect(reportFor(payload, "loc").more_on_this_archive).toBeNull();
  });
});

describe("a record read in full", () => {
  it("returns the archive's further prose rather than folding it into the description", async () => {
    const payload = payloadOf<{ item: { description: string | null; notes: string[] } }>(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );
    expect(payload.item.description).not.toContain("Includes bibliographical references.");
    expect(payload.item.notes).toContain("Includes bibliographical references.");
  });

  it("shows that prose in the text block, where a client renders nothing else", async () => {
    const text = textOf(
      await runGetItem(fakeClient(), recordArgs({ identifier: "loc:2011000001" })),
    );
    expect(text).toContain("Includes bibliographical references.");
  });

  it("says how much of the prose the text block shows", () => {
    expect(describedIn(getItemInput.shape.max_text_chars)).toMatch(/text block/);
  });
});

describe("a count an archive does not publish", () => {
  it("is described as unpublished rather than as a count of none", () => {
    expect(describedIn(rowSchema.shape.downloads)).toMatch(/publishes no such count/);
  });
});

describe("the sentence counting excerpts that are page openings", () => {
  it("reads as one sentence when there is one of each", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchInside(fakeClient(), insideArgs({ max_excerpts_per_match: 1 })),
    );
    const note = payload.notes.find((entry) => entry.includes("opening of a page"))!;
    expect(note).toMatch(/1 of the 4 excerpts here is the opening of a page/);
    expect(note).toMatch(/across 1 match\./);
  });

  it("reads as a plural when there are several", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchInside(
        fakeClient({
          loc: {
            insideHits: locInsideHits.map((hit) => ({ ...hit, wordsLocated: false })),
          },
        }),
        insideArgs({ max_excerpts_per_match: 1 }),
      ),
    );
    const note = payload.notes.find((entry) => entry.includes("opening of a page"))!;
    expect(note).toMatch(/2 of the 4 excerpts here are the opening of a page/);
    expect(note).toMatch(/across 2 matches\./);
  });
});
