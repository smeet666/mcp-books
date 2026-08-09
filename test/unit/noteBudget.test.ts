/**
 * What survives in the block when an answer has more to qualify it than room.
 *
 * The notes are where an answer says an archive failed, which narrowing never
 * reached which catalogue, what an index actually read, and what may be reused.
 * A client that renders the text block and nothing else shows a reader those
 * sentences or shows them nothing, so a note that qualifies the answer is the
 * last thing the block may give up, and giving one up is itself something the
 * answer has to say.
 */

import { describe, expect, it } from "vitest";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { MAX_BLOCK_CHARS, ok } from "../../src/tools/shared.js";
import { fakeClient, insideArgs, locInsideHits, payloadOf, textOf } from "./support.js";

/**
 * The sentences a merged answer over several archives carries at once.
 *
 * Each one qualifies the answer: it names a narrowing an archive never
 * received, the fields an index matched against, a count that is not a total,
 * or the terms a row states nothing about. None of them can be inferred from
 * the rows.
 */
const QUALIFYING = [
  "the Internet Archive reported 2529: records in its catalogue that match, across every page.",
  "the Library of Congress reported 374: catalogue records that match, across every page.",
  "the Bibliothèque nationale de France states no total, so a short list here is not evidence that little exists.",
  "Each count above counts something different, and they are never added together into one number.",
  "the Bibliothèque nationale de France was not given the year range asked for. Its search takes words and nothing else, so a year range cannot travel with them and its rows were narrowed by no date at all. Its rows are here unnarrowed by it, so one of them satisfying it does so by chance rather than because it was filtered.",
  'the Bibliothèque nationale de France was not given the "oldest" order asked for. Its search returns rows in the order its own index holds them and takes no order to apply, so nothing here was placed by the order that was asked for.',
  "The archives matched these words against different fields: the Internet Archive on titles, creators and subjects together, in one index over the whole record; the Bibliothèque nationale de France on the title of a work and nothing beside it.",
  "the Bibliothèque nationale de France reads titles alone, so a person's name given to it comes back as the books about that person rather than the books by them.",
  "the Library of Congress does not require every word given to appear: it scores them and answers with the records it ranks highest, so a row of its here can carry only some of them.",
  "1 of the 17 rows here carries an identifier its archive calls provisional: it is held while a cataloguer settles the record and can change, so prefer a settled identifier when citing one.",
  "A catalogue row states no terms of reuse. Read a record with get_item for what that record itself says, and read a record stating nothing as a record that has granted nothing.",
  "\"oldest\" ordered each archive's own rows on a date field carrying a year and no era, so a date before the common era is filed there as a year of this one. Read 'date' and the record itself before calling a row either.",
  "4 of the 17 rows here carry no year. An archive ordering on a date files a row without one under a stand-in rather than by its age.",
  "A list built from more than one wording holds their union, deduplicated on the identifier this server hands out, in the order the wordings were sent. 'queries' in per_source holds every wording, sent or withheld.",
];

describe("an answer with more to qualify it than the block would hold", () => {
  it("renders every sentence that qualifies a merged answer", () => {
    const text = textOf(
      ok({}, "17 records for a question put to three archives:", { notes: QUALIFYING }),
    );

    for (const note of QUALIFYING) {
      expect(text, `dropped: ${note.slice(0, 60)}`).toContain(note.slice(0, 60));
    }
  });

  it("says how many qualifying sentences were left out, and where to read them", () => {
    const notes = Array.from(
      { length: 60 },
      (_, index) =>
        `${index}. the Bibliothèque nationale de France was not given the year range asked for, so its rows are here unnarrowed by it and one of them satisfying it does so by chance.`,
    );

    const text = textOf(ok({}, "the answer", { notes }));

    expect(text).toMatch(/\d+ further note/);
    expect(text).toMatch(/structured output/);
  });

  it("keeps the whole block within the ceiling it publishes", () => {
    const notes = Array.from(
      { length: 60 },
      (_, index) => `${index}. this record states no terms of reuse, and silence here is silence.`,
    );

    expect(textOf(ok({}, "x".repeat(9000), { notes })).length).toBeLessThanOrEqual(MAX_BLOCK_CHARS);
  });

  it("leaves the answer itself room when the notes are few", () => {
    const text = textOf(ok({}, "x".repeat(9000), { notes: ["one short remark"] }));
    expect(text.length).toBeGreaterThan(2000);
  });
});

/**
 * An answer whose rows outnumber the room the block has for them.
 *
 * The block is where a match is quoted, and an answer announcing matches while
 * quoting none of them is a list of titles a reader cannot judge. The rows give
 * way to the notes down to a floor, and what is left renders whole: the passage
 * that matched, the identifier and the address, with a line saying how many
 * further matches are in the structured output.
 */
describe("a long answer", () => {
  it("quotes the matches it does render, and counts the ones it does not", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      ...locInsideHits[0]!,
      identifier: `sn0000000${index}/1884-03-02/ed-1`,
      title: `Image ${index} of The Redlaw Sentinel, March 2, 1884`,
      sourceUrl: `https://www.loc.gov/resource/sn0000000${index}/1884-03-02/ed-1/?sp=4`,
    }));

    const result = await runSearchInside(
      fakeClient({ loc: { insideHits: many } }),
      insideArgs({ limit: 25 }),
    );
    const text = textOf(result);
    const payload = payloadOf<{ hits: unknown[] }>(result);

    expect(payload.hits.length).toBeGreaterThan(20);
    expect(text).toMatch(/\[passage\]|\[page opening\]/);
    expect(text).toMatch(/further match\(es\) are in the structured output/);
  });
});
