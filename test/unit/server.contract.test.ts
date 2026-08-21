/**
 * What the server offers a client that has never seen it.
 *
 * A tool is chosen from its name, its description and its schema, so those are
 * the interface, and they are checked here the way an argument would be. The
 * guidance is checked too, because it is what a model reads before it has seen
 * a single result.
 */

import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { loadConfig } from "../../src/config.js";
import { INSTRUCTIONS, buildInstructions, createServer } from "../../src/server.js";
import { getItemInput, getItemOutput } from "../../src/tools/getItem.js";
import { searchInsideInput, searchInsideOutput } from "../../src/tools/searchInside.js";
import { searchItemsInput, searchItemsOutput } from "../../src/tools/searchItems.js";
import { fakeClient, standInProfile } from "./support.js";
import manifest from "../../package.json" with { type: "json" };

interface RegisteredTool {
  description?: string;
  annotations?: Record<string, boolean>;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

function registered(): Record<string, RegisteredTool> {
  const server = createServer({ config: loadConfig({}), client: fakeClient() });
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

const TOOLS = ["search_inside", "search_items", "get_item"];

describe("what the server offers", () => {
  it("registers exactly the three tools", () => {
    expect(Object.keys(registered()).sort()).toEqual([...TOOLS].sort());
  });

  it("declares every tool as read-only and non-destructive", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect(tool.annotations, name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  });

  it("declares an input and an output schema on every tool", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect(tool.inputSchema, name).toBeDefined();
      expect(tool.outputSchema, name).toBeDefined();
    }
  });

  it("describes every tool in enough words to choose between them", () => {
    for (const [name, tool] of Object.entries(registered())) {
      expect((tool.description ?? "").length, name).toBeGreaterThan(200);
    }
  });

  it("names every tool in the guidance a model reads first", () => {
    for (const name of TOOLS) expect(INSTRUCTIONS).toContain(name);
  });
});

describe("the guidance a model reads before choosing", () => {
  it("names the archives it reads, and how many", () => {
    expect(INSTRUCTIONS).toContain("the Internet Archive");
    expect(INSTRUCTIONS).toContain("the Library of Congress");
    expect(INSTRUCTIONS).toMatch(/reading \d+ archives/);
  });

  it("says the two corpora are different bodies of material", () => {
    expect(INSTRUCTIONS).toMatch(/different bodies of material/);
    expect(INSTRUCTIONS).toMatch(/additive/);
  });

  it("says a page number that is null is an index holding none", () => {
    expect(INSTRUCTIONS).toMatch(/publishes no leaf number/);
    expect(INSTRUCTIONS).toMatch(/never a page that was dropped/);
  });

  it("says what an excerpt that is a page opening is worth", () => {
    expect(INSTRUCTIONS).toMatch(/page_opening/);
    expect(INSTRUCTIONS).toMatch(/does not carry the match/);
  });

  it("says a failed archive is never an absence, with the moment that failed", () => {
    expect(INSTRUCTIONS).toMatch(/never evidence about what the others hold/);
    expect(INSTRUCTIONS).toMatch(/a search that did not answer, or a search that answered/);
  });

  it("says counts are never added and rows are never ranked across archives", () => {
    expect(INSTRUCTIONS).toMatch(/never added/);
    expect(INSTRUCTIONS).toMatch(/no order by date across them/);
  });

  it("says terms of reuse belong to a record", () => {
    expect(INSTRUCTIONS).toMatch(/stated per record and never summed/);
  });

  it("warns that an answer takes several seconds, and why", () => {
    expect(INSTRUCTIONS).toMatch(/Answers take several seconds/);
    expect(INSTRUCTIONS).toMatch(/at the same time rather than one after another/);
    expect(INSTRUCTIONS).toMatch(/6 seconds between requests/);
  });

  it("asks for the archive to be credited", () => {
    expect(INSTRUCTIONS).toMatch(/Credit the archive/);
  });

  it("names the archives it reads and no library it is built on", () => {
    // A caller can act on the name of an archive. The name of a package this
    // server happens to import tells them nothing, so the guidance names none
    // of them: the pattern is built from what the package actually depends on,
    // rather than from a list that would go stale beside it.
    const dependencies = Object.keys(
      (manifest as { dependencies?: Record<string, string> }).dependencies ?? {},
    );
    for (const name of dependencies) expect(INSTRUCTIONS, name).not.toContain(name);
    expect(INSTRUCTIONS).not.toMatch(/\bnpm\b|\bpackage\b/i);
  });
});

describe("the guidance when an archive answers only some of the tools", () => {
  const readsText = {
    id: "here",
    name: "an archive that reads text",
    homeUrl: "https://example.invalid",
    attribution: "Source: an archive that reads text",
    creditNote: null,
    searchesOn: "titles, creators and subjects together",
    searchesOnCaveat: null,
    catalogueRequiresEveryWord: true,
    insideRequiresEveryWord: true,
    rowDescribes: "a volume this archive holds",
    insideCorpus: "the text of its own scans",
    yearMeans: "the year printed on the volume",
    descriptionMeans: "the description field of the catalogue record",
    publishesPageNumber: true,
    mediaTypes: ["books"],
    defaultMediaType: "books",
    answers: ["search_inside", "search_items", "get_item"] as const,
    cannot: {},
    honours: ["year_range", "sort"] as const,
    cannotFilter: {},
    paceMs: 1000,
    paceReason: "politeness",
  };

  const withStandIn = () =>
    buildInstructions(
      [
        {
          id: "here",
          name: "an archive that reads text",
          homeUrl: "https://example.invalid",
          attribution: "Source: an archive that reads text",
          creditNote: null,
          searchesOn: "titles, creators and subjects together",
          searchesOnCaveat: null,
          catalogueRequiresEveryWord: true,
          insideRequiresEveryWord: true,
          rowDescribes: "a volume this archive holds",
          insideCorpus: "the text of its own scans",
          yearMeans: "the year printed on the volume",
          descriptionMeans: "the description field of the catalogue record",
          publishesPageNumber: true,
          mediaTypes: ["books"],
          defaultMediaType: "books",
          answers: ["search_inside", "search_items", "get_item"],
          cannot: {},
          honours: ["year_range", "sort"],
          cannotFilter: {},
          paceMs: 1000,
          paceReason: "politeness",
        },
        { ...standInProfile, answers: [...standInProfile.answers] },
      ],
      [{ name: "an archive that reads text", intervalMs: 1000, because: "politeness" }],
    );

  it("names the archive that cannot be searched inside its text", () => {
    expect(withStandIn()).toMatch(/a stand-in archive cannot be searched inside its text/);
  });

  it("says it is named as absent rather than left out", () => {
    expect(withStandIn()).toMatch(/named as absent from that tool rather than quietly left out/);
  });

  it("carries that archive's own reason, so a caller can act on it", () => {
    expect(withStandIn()).toMatch(/robots file/);
  });

  it("says nothing of the kind when every archive answers every tool", () => {
    const everyTool = buildInstructions(
      [{ ...readsText, answers: [...readsText.answers], honours: [...readsText.honours] }],
      [{ name: readsText.name, intervalMs: 1000, because: "politeness" }],
    );
    expect(everyTool).not.toMatch(/cannot be searched inside its text/);
  });
});

describe("what each tool takes", () => {
  it("defaults a full-text search to every archive, which is the point", () => {
    const parsed = searchInsideInput.parse({ query: "wet fog" });
    expect(parsed.sources).toBeUndefined();
    expect(parsed.limit).toBe(3);
    expect(parsed.page).toBe(1);
  });

  it("refuses a full-text search with nothing to look for", () => {
    expect(() => searchInsideInput.parse({ query: "" })).toThrow();
    expect(() => searchInsideInput.parse({ query: "a" })).toThrow();
  });

  it("bounds the size of a full-text answer at both ends", () => {
    expect(() => searchInsideInput.parse({ query: "x y", max_excerpt_chars: 20 })).toThrow();
    expect(() => searchInsideInput.parse({ query: "x y", max_excerpts_per_match: 0 })).toThrow();
    expect(() => searchInsideInput.parse({ query: "x y", limit: 200 })).toThrow();
  });

  it("defaults a catalogue search to relevance and every archive", () => {
    const parsed = searchItemsInput.parse({ query: "cormorant" });
    expect(parsed.sort).toBe("relevance");
    expect(parsed.media_type).toBeUndefined();
  });

  it("refuses a sort order no archive offers", () => {
    expect(() => searchItemsInput.parse({ query: "x", sort: "downloads" })).toThrow();
  });

  it("refuses a year outside the range a catalogue can hold", () => {
    expect(() => searchItemsInput.parse({ query: "x", year_from: 12 })).toThrow();
    expect(() => searchItemsInput.parse({ query: "x", year_to: 9999 })).toThrow();
  });

  it("defaults a record read to the prose, and to nothing large", () => {
    const parsed = getItemInput.parse({ identifier: "archive:x" });
    expect(parsed.sections).toEqual(["description"]);
    expect(parsed.text_offset).toBe(0);
  });

  it("refuses an identifier of no length", () => {
    expect(() => getItemInput.parse({ identifier: "" })).toThrow();
  });

  it("refuses a section no archive files anything under", () => {
    expect(() =>
      getItemInput.parse({ identifier: "archive:x", sections: ["everything"] }),
    ).toThrow();
  });
});

describe("what each tool promises to return", () => {
  const shapes: Array<[string, z.ZodObject<z.ZodRawShape>]> = [
    ["search_inside", searchInsideOutput],
    ["search_items", searchItemsOutput],
    ["get_item", getItemOutput],
  ];

  it("carries notes on every tool, because every answer can need qualifying", () => {
    for (const [name, schema] of shapes) {
      expect(Object.keys(schema.shape), name).toContain("notes");
    }
  });

  it("carries the per-archive report on every tool that asks several archives", () => {
    expect(Object.keys(searchInsideOutput.shape)).toContain("per_source");
    expect(Object.keys(searchItemsOutput.shape)).toContain("per_source");
  });

  it("reports no total across archives on either search", () => {
    expect(Object.keys(searchInsideOutput.shape)).not.toContain("total");
    expect(Object.keys(searchItemsOutput.shape)).not.toContain("total");
  });
});
