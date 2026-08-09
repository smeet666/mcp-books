/**
 * What each archive's index is, said where it is true and nowhere else.
 *
 * An archive is described by several sentences: which fields its catalogue
 * matches against, what one of its rows is, what body of material its full-text
 * index reads, and whether that index answers only where every word given
 * appears. Each sentence belongs to one question. Serving all of them whatever
 * was asked describes a catalogue search as reading newspapers, and a full-text
 * search as matching titles and subjects.
 */

import { describe, expect, it } from "vitest";
import { ARCHIVE_PROFILE } from "../../src/sources/archive.js";
import { BNF_PROFILE } from "../../src/sources/bnf.js";
import { LOC_PROFILE } from "../../src/sources/loc.js";
import { runSearchInside, searchInsideDescription } from "../../src/tools/searchInside.js";
import { runSearchItems, searchItemsDescription } from "../../src/tools/searchItems.js";
import { INSTRUCTIONS } from "../../src/server.js";
import { fakeClient, insideArgs, itemArgs, payloadOf, reportFor, textOf } from "./support.js";

interface Report {
  source: string;
  status: string;
  searches_on: string | null;
  row_describes: string | null;
  corpus: string | null;
  publishes_page_number: boolean | null;
  requires_every_word: boolean | null;
}

interface Payload {
  notes: string[];
  per_source: Report[];
}

/* -------------------------------------------------------------------------- */
/* A description block belongs to the question it answers                      */
/* -------------------------------------------------------------------------- */

describe("what a full-text answer says each archive read", () => {
  it("names no catalogue fields, because no catalogue was searched", async () => {
    const payload = payloadOf<Payload>(await runSearchInside(fakeClient(), insideArgs()));

    for (const report of payload.per_source) {
      expect(report.searches_on, report.source).toBeNull();
      expect(report.row_describes, report.source).toBeNull();
    }
  });

  it("says nothing about an archive it never asked", async () => {
    const payload = payloadOf<Payload>(await runSearchInside(fakeClient(), insideArgs()));
    const absent = payload.per_source.filter((report) => report.status === "absent");

    expect(absent.length).toBeGreaterThan(0);
    for (const report of absent) {
      expect(report.searches_on, report.source).toBeNull();
      expect(report.corpus, report.source).toBeNull();
      expect(report.publishes_page_number, report.source).toBeNull();
      expect(report.requires_every_word, report.source).toBeNull();
    }
  });
});

describe("what a catalogue answer says each archive read", () => {
  it("names no corpus of scanned text, because none was read", async () => {
    const payload = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs()));

    for (const report of payload.per_source) {
      expect(report.corpus, report.source).toBeNull();
      expect(report.publishes_page_number, report.source).toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* An index over titles alone, whether or not another archive answered beside  */
/* -------------------------------------------------------------------------- */

describe("an archive whose catalogue index reads titles alone", () => {
  it("says what that does to a person's name even when it answered alone", async () => {
    const payload = payloadOf<Payload>(
      await runSearchItems(fakeClient(), itemArgs({ query: "Victor Hugo", sources: ["bnf"] })),
    );

    expect(payload.notes.some((note) => /books (written )?about/i.test(note))).toBe(true);
  });

  it("does not say it of an answer where no archive reads titles alone", async () => {
    const payload = payloadOf<Payload>(
      await runSearchItems(fakeClient(), itemArgs({ sources: ["archive", "loc"] })),
    );

    expect(payload.notes.some((note) => /titles alone/i.test(note))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Whether an index requires every word given                                  */
/* -------------------------------------------------------------------------- */

describe("whether every word given has to appear", () => {
  it("is declared per index rather than assumed of them all", () => {
    expect(ARCHIVE_PROFILE.catalogueRequiresEveryWord).toBe(true);
    expect(ARCHIVE_PROFILE.insideRequiresEveryWord).toBe(true);
    // Verified against the catalogue itself: six rare words return records
    // carrying none of them, ranked rather than filtered.
    expect(LOC_PROFILE.catalogueRequiresEveryWord).toBe(false);
    expect(LOC_PROFILE.insideRequiresEveryWord).toBe(true);
    expect(BNF_PROFILE.catalogueRequiresEveryWord).toBe(true);
    expect(BNF_PROFILE.insideRequiresEveryWord).toBeNull();
  });

  it("reaches the answer, per archive and per tool", async () => {
    const items = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs()));
    expect(reportFor(items, "loc").requires_every_word).toBe(false);
    expect(reportFor(items, "archive").requires_every_word).toBe(true);

    const inside = payloadOf<Payload>(await runSearchInside(fakeClient(), insideArgs()));
    expect(reportFor(inside, "loc").requires_every_word).toBe(true);
  });

  it("is said in the notes wherever an archive that ranks instead contributed rows", async () => {
    const payload = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs()));

    expect(
      payload.notes.some(
        (note) => /the Library of Congress/.test(note) && /only some of (the|them)/i.test(note),
      ),
    ).toBe(true);
  });

  it("is never asserted of every archive at once", () => {
    for (const prose of [searchInsideDescription, searchItemsDescription, INSTRUCTIONS]) {
      expect(prose).not.toMatch(/A catalogue index requires every word given to appear/);
      expect(prose).not.toMatch(/These indexes require every word given to appear/);
    }
  });

  it("keeps the text block honest about the archive that ranks", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    expect(text).toMatch(/only some of/i);
  });
});

/* -------------------------------------------------------------------------- */
/* A query carrying something that is not a word                               */
/* -------------------------------------------------------------------------- */

describe("a query carrying a character that is not a letter or a digit", () => {
  const withEmoji = { query: "🐋 cormorant 🐋" };

  it("names that character in a catalogue answer", async () => {
    const payload = payloadOf<Payload & { non_word_characters: string[] }>(
      await runSearchItems(fakeClient(), itemArgs(withEmoji)),
    );
    expect(payload.non_word_characters).toEqual(["🐋"]);
  });

  it("names it in a full-text answer too", async () => {
    const payload = payloadOf<Payload & { non_word_characters: string[] }>(
      await runSearchInside(fakeClient(), insideArgs(withEmoji)),
    );
    expect(payload.non_word_characters).toEqual(["🐋"]);
  });

  it("says so in the block a client renders, beside rows that carry none of it", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs(withEmoji)));
    expect(text).toMatch(/neither a letter nor a digit/);
    expect(text).toContain("🐋");
  });

  it("scopes the promise that every word given appears to the words", async () => {
    const payload = payloadOf<Payload>(await runSearchItems(fakeClient(), itemArgs(withEmoji)));
    // The flag stays what the index is, and the answer stops reading as a
    // promise that a row carries the character too.
    expect(reportFor(payload, "archive").requires_every_word).toBe(true);
    expect(payload.notes.join(" ")).toMatch(/requires_every_word/);
  });

  it("says nothing of the kind about a query written in words alone", async () => {
    const payload = payloadOf<Payload & { non_word_characters: string[] }>(
      await runSearchItems(fakeClient(), itemArgs({ query: "did Poe write about the raven?" })),
    );
    expect(payload.non_word_characters).toEqual([]);
    expect(payload.notes.join(" ")).not.toMatch(/neither a letter nor a digit/);
  });
});
