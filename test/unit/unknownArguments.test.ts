/**
 * An argument this server does not declare is a question it cannot answer.
 *
 * Reading it and dropping it produces an answer computed on the defaults, which
 * a caller reads as the answer to what they asked. The rule is announced on
 * every tool, so the refusal is checked on every tool.
 */

import { describe, expect, it } from "vitest";
import { getItemInput } from "../../src/tools/getItem.js";
import { searchInsideInput } from "../../src/tools/searchInside.js";
import { searchItemsInput } from "../../src/tools/searchItems.js";

const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("nothing was refused");
};

describe("an argument no tool declares", () => {
  it("is refused rather than dropped", () => {
    expect(() => searchInsideInput.parse({ query: "wet fog", corpus: "books" })).toThrow();
    expect(() => searchItemsInput.parse({ query: "cormorant", author: "Pellisier" })).toThrow();
    expect(() => getItemInput.parse({ identifier: "archive:x", fields: ["title"] })).toThrow();
  });

  it("is named in the refusal, with the code a caller branches on", () => {
    const message = refusal(() => searchInsideInput.parse({ query: "wet fog", corpus: "books" }));
    expect(message).toContain("invalid_input");
    expect(message).toContain("'corpus'");
  });

  it("lists what the tool does take", () => {
    const message = refusal(() => searchInsideInput.parse({ query: "wet fog", corpus: "books" }));
    expect(message).toContain("max_excerpt_chars");
  });
});

describe("an argument close to one the tool declares", () => {
  it("offers the declared name", () => {
    const message = refusal(() => searchItemsInput.parse({ query: "x", mediatype: "books" }));
    expect(message).toMatch(/did you mean 'media_type'/);
  });

  it("offers it across a difference of punctuation alone", () => {
    const message = refusal(() => searchItemsInput.parse({ query: "x", "year-from": 1800 }));
    expect(message).toMatch(/did you mean 'year_from'/);
  });

  it("offers nothing when the name is a guess away from everything", () => {
    const message = refusal(() => searchInsideInput.parse({ query: "x y", zzzzzzzzzz: 1 }));
    expect(message).toContain("'zzzzzzzzzz'");
    expect(message).not.toMatch(/did you mean/);
  });
});

describe("an argument of the wrong type", () => {
  it("is refused rather than coerced", () => {
    expect(() => searchInsideInput.parse({ query: "wet fog", limit: "five" })).toThrow();
    expect(() => searchItemsInput.parse({ query: "x", year_from: "1800" })).toThrow();
    expect(() =>
      getItemInput.parse({ identifier: "archive:x", sections: "description" }),
    ).toThrow();
  });

  it("refuses a fractional count of matches", () => {
    expect(() => searchInsideInput.parse({ query: "wet fog", limit: 2.5 })).toThrow();
  });
});
