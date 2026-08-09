/**
 * Which archive an identifier names.
 *
 * The same string exists on more than one archive and means different things
 * there, so a string that could be either is refused rather than resolved.
 * Picking a winner would answer confidently about the wrong thing.
 */

import { describe, expect, it } from "vitest";
import { resolveId, sourceOf } from "../../src/sources/ids.js";
import { fakeSources } from "./support.js";

const sources = fakeSources();

/** The hint a refusal carries, which is where the next move is written. */
function hintOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as { details?: { hint?: string } }).details?.hint ?? "";
  }
  throw new Error("nothing was refused");
}

describe("an identifier spelled with its archive", () => {
  it("routes on what it says", () => {
    const read = resolveId("archive:voyageofthecormorant00pell", sources);
    expect(read.source.id).toBe("archive");
    expect(read.reference).toBe("voyageofthecormorant00pell");
    expect(read.inferred).toBeNull();
  });

  it("keeps the separators inside an identifier that carries them", () => {
    const read = resolveId("loc:sn00000001/1884-03-02/ed-1", sources);
    expect(read.source.id).toBe("loc");
    expect(read.reference).toBe("sn00000001/1884-03-02/ed-1");
  });

  it("is refused when it names an archive and no record", () => {
    expect(() => resolveId("loc:", sources)).toThrow(/names an archive and no record/);
  });

  it("reads the prefix whatever case it was typed in", () => {
    expect(resolveId("ARCHIVE:abc", sources).source.id).toBe("archive");
  });
});

describe("an address a caller pasted", () => {
  it("routes an item page on the Internet Archive", () => {
    const read = resolveId("https://archive.org/details/voyageofthecormorant00pell", sources);
    expect(read.source.id).toBe("archive");
    expect(read.reference).toBe("voyageofthecormorant00pell");
  });

  it("routes a record on the Library of Congress", () => {
    const read = resolveId("https://www.loc.gov/item/2011000001/", sources);
    expect(read.source.id).toBe("loc");
    expect(read.reference).toBe("2011000001");
  });

  it("routes a newspaper page and keeps every segment of its name", () => {
    const read = resolveId("https://www.loc.gov/resource/sn00000001/1884-03-02/ed-1/", sources);
    expect(read.reference).toBe("sn00000001/1884-03-02/ed-1");
  });

  it("routes a catalogue number on the Library's own host", () => {
    const read = resolveId("https://lccn.loc.gov/2011000001", sources);
    expect(read.source.id).toBe("loc");
    expect(read.reference).toBe("2011000001");
  });

  it("names a collection by its slug alone", () => {
    const read = resolveId("https://www.loc.gov/collections/chronicling-america/about", sources);
    expect(read.reference).toBe("chronicling-america");
  });

  it("says which reading it used, so nothing is settled silently", () => {
    const read = resolveId("https://archive.org/details/abc", sources);
    expect(read.inferred).toMatch(/the address is an item on the Internet Archive/);
  });
});

describe("a bare token both archives mint", () => {
  it("is refused rather than sent to one of them", () => {
    expect(() => resolveId("2011000001", sources)).toThrow(/names no one record/);
  });

  it("offers both spellings", () => {
    expect(hintOf(() => resolveId("2011000001", sources))).toMatch(
      /archive:2011000001 or loc:2011000001/,
    );
  });
});

describe("a string no archive would have minted", () => {
  it("is refused rather than guessed at", () => {
    expect(() => resolveId("The Voyage of the Cormorant", sources)).toThrow(
      /not an identifier any of the archives/,
    );
  });

  it("says what to do with the words that were typed", () => {
    expect(hintOf(() => resolveId("The Voyage of the Cormorant", sources))).toMatch(
      /Call search_items with "The Voyage of the Cormorant" as the query/,
    );
  });

  it("refuses an empty identifier", () => {
    expect(() => resolveId("   ", sources)).toThrow(/A record identifier is required/);
  });

  it("refuses an address on a host neither archive serves", () => {
    expect(() => resolveId("https://example.invalid/item/1", sources)).toThrow(
      /not an identifier any of the archives/,
    );
  });
});

describe("an identifier carrying a control character", () => {
  // A control character renders as nothing, so the string a reader sees and the
  // string an archive receives are two different identifiers.
  const hidden = "archive:voyageofthecormorant\u000100pell";

  it("is refused rather than sent as it was typed", () => {
    expect(() => resolveId(hidden, sources)).toThrow(/control character/);
  });

  it("names no identifier in the refusal, since none was asked for", () => {
    let message = "";
    try {
      resolveId(hidden, sources);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("voyageofthecormorant00pell");
  });

  it("says where an identifier comes from", () => {
    expect(hintOf(() => resolveId(hidden, sources))).toMatch(/search/i);
  });
});

describe("naming the archive without resolving the record", () => {
  it("reads the prefix alone", () => {
    expect(sourceOf("loc:anything/at/all", sources)).toBe("loc");
    expect(sourceOf("nobody:anything", sources)).toBeNull();
  });
});
