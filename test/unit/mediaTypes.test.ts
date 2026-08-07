/**
 * One argument name, one vocabulary per archive.
 *
 * `texts` and `books` are not the same set of things, and the archives that use
 * those words hold different material under them. Translating one into the
 * other would search something other than what was asked for and report it as
 * what was asked for, so an archive that does not use the name given is named
 * as absent and its own names are published beside the answer.
 */

import { describe, expect, it } from "vitest";
import { MEDIA_TYPES } from "../../src/sources/registry.js";
import { chooseMediaTypes } from "../../src/sources/client.js";
import { searchItemsInput } from "../../src/tools/searchItems.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import { fakeClient, itemArgs, payloadOf, reportFor, textOf } from "./support.js";
import { archiveAdapter } from "../../src/sources/archive.js";
import { locAdapter } from "../../src/sources/loc.js";
import { fakeArchive, fakeLoc } from "./support.js";

interface Payload {
  items: Array<{ source: string }>;
  per_source: Array<{ source: string; status: string; media_type_asked: string | null }>;
  media_types: Array<{ source: string; asked_with: string | null; vocabulary: string[] }>;
  notes: string[];
}

const sources = () => [archiveAdapter(fakeArchive()), locAdapter(fakeLoc())];

describe("the names a caller may give", () => {
  it("are the union of what the archives use, not an invented common set", () => {
    expect(MEDIA_TYPES).toContain("texts");
    expect(MEDIA_TYPES).toContain("books");
    expect(MEDIA_TYPES).toContain("maps");
    expect(MEDIA_TYPES).toContain("software");
  });

  it("are the ones the tool accepts", () => {
    expect(() => searchItemsInput.parse({ query: "x", media_type: "texts" })).not.toThrow();
    expect(() => searchItemsInput.parse({ query: "x", media_type: "books" })).not.toThrow();
    expect(() => searchItemsInput.parse({ query: "x", media_type: "livres" })).toThrow();
  });
});

describe("a name only one archive uses", () => {
  it("asks that archive and leaves the other out", () => {
    const { asked, absent } = chooseMediaTypes(sources(), "texts");
    expect(asked.get("archive")).toBe("texts");
    expect(absent.map((entry) => entry.source.id)).toEqual(["loc"]);
  });

  it("gives the reason and the archive's own names", () => {
    const { absent } = chooseMediaTypes(sources(), "texts");
    expect(absent[0]?.because).toMatch(/files no kind of material under "texts"/);
    expect(absent[0]?.because).toMatch(/books, photos, maps/);
  });

  it("never asks the other archive under a translated name", () => {
    const { asked } = chooseMediaTypes(sources(), "books");
    expect(asked.has("archive")).toBe(false);
    expect(asked.get("loc")).toBe("books");
  });
});

describe("a name both archives use", () => {
  it("asks both under the word they each use", () => {
    const { asked, absent } = chooseMediaTypes(sources(), "audio");
    expect(absent).toHaveLength(0);
    expect(asked.get("archive")).toBe("audio");
    expect(asked.get("loc")).toBe("audio");
  });
});

describe("a search naming a kind of material", () => {
  it("names the archive it left out, in the answer", async () => {
    const payload = payloadOf<Payload>(
      await runSearchItems(fakeClient(), itemArgs({ media_type: "texts" })),
    );

    expect(reportFor(payload, "loc").status).toBe("absent");
    expect(payload.items.every((row) => row.source === "archive")).toBe(true);
    expect(payload.notes.join(" ")).toMatch(/files no kind of material under "texts"/);
  });

  it("publishes what each archive was asked under, and its whole vocabulary", async () => {
    const payload = payloadOf<Payload>(
      await runSearchItems(fakeClient(), itemArgs({ media_type: "audio" })),
    );
    const archive = payload.media_types.find((entry) => entry.source === "archive")!;

    expect(archive.asked_with).toBe("audio");
    expect(archive.vocabulary).toContain("movies");
  });

  it("says nothing here is evidence about the archive that was not asked", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs({ media_type: "texts" })));
    expect(text).toMatch(/Nothing in this answer is evidence about what it holds/);
  });
});

describe("a search naming no kind of material", () => {
  it("leaves an archive that searches every kind unnarrowed", async () => {
    const payload = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs()));
    expect(reportFor(payload, "archive").media_type_asked).toBeNull();
  });

  it("states the narrowing on an archive that keeps one catalogue per kind", async () => {
    const payload = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs()));

    expect(reportFor(payload, "loc").media_type_asked).toBe("books");
    expect(payload.notes.join(" ")).toMatch(
      /keeps one catalogue per kind of material, so it was asked for "books" and nothing else/,
    );
  });

  it("offers the other catalogues that archive keeps", async () => {
    const payload = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs()));
    expect(payload.notes.join(" ")).toMatch(/Set media_type to read another of its catalogues/);
  });

  it("keeps that sentence out of an answer where a kind was named", async () => {
    const payload = payloadOf<Payload>(
      await runSearchItems(fakeClient(), itemArgs({ media_type: "maps" })),
    );
    expect(payload.notes.join(" ")).not.toMatch(/asked for "books" and nothing else/);
  });
});

describe("a search where no archive uses the name and none is left", () => {
  it("says no archive was asked rather than answering with an absence", async () => {
    const result = await runSearchItems(
      fakeClient(),
      itemArgs({ media_type: "books", sources: ["archive"] }),
    );
    const payload = payloadOf<Payload>(result);

    expect(payload.items).toHaveLength(0);
    expect(reportFor(payload, "archive").status).toBe("absent");
    expect(textOf(result)).toMatch(/No archive answered/);
  });
});
