/**
 * The narrowings a caller asks a catalogue for.
 *
 * A narrowing is either applied by an archive or named as one that never
 * reached it. The case these hold the server to is the one in between: a range
 * every archive receives and each reads differently, where one returns nothing
 * and another answers as though no range had been given. An answer built out of
 * both would report a criterion as applied while showing rows that do not meet
 * it.
 */

import { describe, expect, it } from "vitest";
import { BooksClient } from "../../src/sources/client.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import { fakeClient, itemArgs, payloadOf, textOf } from "./support.js";

interface ItemsPayload {
  items: Array<{ year: number | null }>;
  notes: string[];
  per_source: Array<{ source: string; filters_dropped: Array<{ filter: string }> }>;
}

describe("a year range whose bounds are the wrong way round", () => {
  it("is refused rather than answered with rows the range excludes", async () => {
    const result = await runSearchItems(fakeClient(), itemArgs({ year_from: 2000, year_to: 1800 }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[invalid_input]");
    expect(textOf(result)).toContain("2000");
    expect(textOf(result)).toContain("1800");
  });

  it("is refused before any archive is asked, on the client a program imports", async () => {
    const asked: string[] = [];
    const client = new BooksClient({
      sources: [
        {
          id: "watched",
          name: "a watched archive",
          homeUrl: "https://example.invalid",
          attribution: "Source: a watched archive",
          creditNote: null,
          searchesOn: "titles",
          searchesOnCaveat: null,
          catalogueRequiresEveryWord: true,
          insideRequiresEveryWord: null,
          rowDescribes: "a volume",
          insideCorpus: null,
          yearMeans: "the year printed on the volume",
          descriptionMeans: "the description field of the catalogue record",
          publishesPageNumber: false,
          mediaTypes: ["books"],
          defaultMediaType: "books",
          answers: ["search_items"],
          cannot: {},
          honours: ["year_range", "sort"],
          cannotFilter: {},
          paceMs: 0,
          paceReason: "a stand-in is not paced",
          claims: () => null,
          async searchItems(query) {
            asked.push(query.query);
            return {
              rows: [],
              skipped: 0,
              reportedTotal: 0,
              reportedTotalMeans: "volumes that match",
              orderedOn: "its own order",
              cached: false,
            };
          },
        },
      ],
    });

    await expect(
      client.searchItems("cormorant", {
        yearFrom: 2000,
        yearTo: 1800,
        sort: "relevance",
        limit: 5,
        page: 1,
      }),
    ).rejects.toThrow(/invalid_input|the wrong way round|later than/i);
    expect(asked).toEqual([]);
  });

  it("accepts a range that names one year, which is a span of one", async () => {
    const result = await runSearchItems(fakeClient(), itemArgs({ year_from: 1871, year_to: 1871 }));

    expect(result.isError).toBeUndefined();
    const payload = payloadOf<ItemsPayload>(result);
    expect(payload.notes.some((note) => note.includes("year range"))).toBe(true);
  });
});
