/**
 * What people actually ask, including the ones who ask badly.
 *
 * Each case here comes from someone using the server the way people do:
 * vaguely, in the wrong language, with a word misspelled, or expecting
 * something the server cannot do. A tool that answers those confidently and
 * wrongly is worse than one that refuses, so what is checked is what the answer
 * says about itself.
 */

import { describe, expect, it } from "vitest";
import { INSTRUCTIONS } from "../../src/server.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import {
  archiveInsideHits,
  archiveRecordWithoutTerms,
  fakeClient,
  insideArgs,
  itemArgs,
  locInsideHits,
  payloadOf,
  recordArgs,
  reportFor,
  textOf,
} from "./support.js";

describe("Aurélie quotes a line she found and wants to know where else it was printed", () => {
  it("tells her the two lists are different corpora put together", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs({ query: '"a wet fog"' })));
    expect(text).toMatch(/read different material/);
    expect(text).toMatch(/says nothing about what the others hold/);
  });

  it("never offers her a number for how often the phrase was printed", async () => {
    const payload = payloadOf<{ per_source: Array<{ reported_total_means: string | null }> }>(
      await runSearchInside(fakeClient(), insideArgs({ query: '"a wet fog"' })),
    );
    for (const report of payload.per_source) {
      expect(report.reported_total_means ?? "").not.toMatch(/counts? occurrences/i);
    }
  });
});

describe("Tom pastes a book title into the tool that reads scanned text", () => {
  it("is told which tool answers a question about a title", async () => {
    const text = textOf(
      await runSearchInside(fakeClient(), insideArgs({ query: "The Voyage of the Cormorant" })),
    );
    // The description says it, and the tool that came back has to be usable
    // without re-reading the description, so the answer carries the link out.
    expect(text).toMatch(/https:\/\//);
  });

  it("finds the tool named in the guidance he read first", () => {
    expect(INSTRUCTIONS).toMatch(/a title, a creator or a subject is search_items/);
  });
});

describe("Nadia asks for maps, which only one archive files under that name", () => {
  it("is told which archive was left out, and why", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs({ media_type: "maps" })));
    expect(text).toMatch(/the Internet Archive was not asked for this/);
    expect(text).toMatch(/files no kind of material under "maps"/);
  });

  it("is given that archive's own names, so the next call can work", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs({ media_type: "maps" })));
    expect(text).toMatch(/texts, movies, audio/);
  });
});

describe("Jonas searches the catalogue and never names a kind of material", () => {
  it("is told that one archive read only one of its catalogues", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    expect(text).toMatch(/keeps one catalogue per kind of material/);
    expect(text).toMatch(/asked for "books" and nothing else/);
  });
});

describe("Priya sees a null page number and takes it for a missing field", () => {
  it("is told the index holds none, in the line that shows the match", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toMatch(/this index holds no page number/);
  });

  it("is told which archive that is, in the notes", async () => {
    const payload = payloadOf<{ notes: string[] }>(
      await runSearchInside(fakeClient(), insideArgs()),
    );
    expect(payload.notes.join(" ")).toMatch(
      /the Internet Archive publishes no leaf number in its full-text index/,
    );
  });
});

describe("Sam quotes an excerpt that turns out to be the opening of a page", () => {
  it("is told the excerpt does not carry the words he searched for", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toContain("[page opening]");
    expect(text).toMatch(/quoting one of them does not quote the match/);
  });

  it("is given the address of the page, so he can read the rest", async () => {
    const text = textOf(await runSearchInside(fakeClient(), insideArgs()));
    expect(text).toContain("https://www.loc.gov/resource/sn00000001/1884-03-02/ed-1/?sp=4");
  });
});

describe("Marguerite asks whether she may republish what she found", () => {
  it("gets an answer about that record and about nothing wider", async () => {
    const payload = payloadOf<{ item: { rights: { note: string } } }>(
      await runGetItem(
        fakeClient({ archive: { record: archiveRecordWithoutTerms } }),
        recordArgs({ identifier: "archive:cormorantlecture1904" }),
      ),
    );
    expect(payload.item.rights.note).toMatch(/says nothing about any other record/);
  });

  it("is never told a list of results is reusable", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs()));
    expect(text).not.toMatch(/free to (use|republish)/i);
    expect(text).toMatch(/A catalogue row states no terms of reuse/);
  });
});

describe("Ivan types a bare catalogue number he copied off a card", () => {
  it("is refused rather than sent to whichever archive would answer", async () => {
    const result = await runGetItem(fakeClient(), recordArgs({ identifier: "2011000001" }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("[invalid_input]");
    expect(textOf(result)).toMatch(/names no one record/);
  });

  it("is shown both spellings, so his next call is exact", async () => {
    const result = await runGetItem(fakeClient(), recordArgs({ identifier: "2011000001" }));
    expect(textOf(result)).toMatch(/archive:2011000001 or loc:2011000001/);
  });
});

describe("Hélène pastes a whole sentence in French into the catalogue", () => {
  it("gets an answer that says nothing came back rather than an empty one", async () => {
    const text = textOf(
      await runSearchItems(
        fakeClient({
          archive: { rows: [], itemTotal: 0 },
          loc: { rows: [], itemTotal: 0 },
          bnf: { rows: [] },
        }),
        itemArgs({ query: "récits de voyages le long des côtes du nord" }),
      ),
    );
    expect(text).toMatch(/Nothing came back/);
    expect(text).toMatch(/Every archive answered and none holds anything under this wording/);
  });
});

describe("Ben asks for something under 300 pages, which no archive filters on", () => {
  it("gets rows rather than a refusal, and every row carries its link", async () => {
    const payload = payloadOf<{ items: Array<{ source_url: string }> }>(
      await runSearchItems(fakeClient(), itemArgs({ query: "cormorant under 300 pages" })),
    );
    for (const row of payload.items) {
      expect(row.source_url.startsWith("https://")).toBe(true);
    }
  });
});

describe("Wei asks for page forty of a search with two matches", () => {
  it("says the page is past the end rather than reading as an absence", async () => {
    const text = textOf(
      await runSearchInside(
        fakeClient({
          archive: { insideHits: [], insideTotal: 4 },
          loc: { insideHits: [], insideTotal: 2 },
        }),
        insideArgs({ page: 40 }),
      ),
    );
    expect(text).toMatch(/Nothing came back/);
    expect(text).not.toMatch(/No archive answered/);
  });

  it("does not tell him to fetch a further page when there is none", async () => {
    const payload = payloadOf<{ notes: string[]; per_source: Array<{ source: string }> }>(
      await runSearchInside(
        fakeClient({ archive: { insideHits: [], insideTotal: 4 } }),
        insideArgs({ page: 40 }),
      ),
    );
    expect(reportFor(payload, "archive").more_on_this_archive).toBe(false);
  });
});

describe("Olu reads only the text block, because that is all his client shows", () => {
  it("gets every match his answer holds, with an address for each", async () => {
    const result = await runSearchInside(fakeClient(), insideArgs({ limit: 3 }));
    const payload = payloadOf<{ hits: Array<{ id: string; source_url: string }> }>(result);
    const text = textOf(result);

    for (const hit of payload.hits) {
      expect(text, hit.id).toContain(hit.source_url);
    }
  });

  it("gets the sentence saying an archive failed, whatever else was cut", async () => {
    const text = textOf(
      await runSearchInside(
        fakeClient({
          archive: {
            insideHits: Array.from({ length: 20 }, (_, index) => ({
              ...archiveInsideHits[0]!,
              identifier: `voyage-${index}`,
            })),
          },
          loc: { fail: new Error("no route") },
        }),
        insideArgs({ limit: 20 }),
      ),
    );
    expect(text).toMatch(/the Library of Congress was asked and its search did not answer/);
  });
});

describe("Renée wants both archives ordered oldest first", () => {
  it("is told each archive ordered its own rows and the merge did not", async () => {
    const text = textOf(await runSearchItems(fakeClient(), itemArgs({ sort: "oldest" })));
    expect(text).toMatch(/Each archive ordered its own rows/);
    expect(text).toMatch(/it is not in that order end to end/);
  });
});

describe("Diego reads a record and wonders why its subject list is empty", () => {
  it("is told when the emptiness is this server reading nothing there", async () => {
    const payload = payloadOf<{ notes: string[]; fields_not_read_from_this_archive: string[] }>(
      await runGetItem(
        fakeClient(),
        recordArgs({ identifier: "archive:voyageofthecormorant00pell", sections: ["subjects"] }),
      ),
    );
    expect(payload.fields_not_read_from_this_archive).toEqual(["notes"]);
    expect(payload.notes.join(" ")).toMatch(/reads nothing into notes from the Internet Archive/);
  });

  it("is told when the emptiness is nobody having asked", async () => {
    const payload = payloadOf<{ notes: string[]; sections_omitted: string[] }>(
      await runGetItem(
        fakeClient(),
        recordArgs({ identifier: "archive:voyageofthecormorant00pell", sections: [] }),
      ),
    );
    expect(payload.sections_omitted).toContain("subjects");
    expect(payload.notes.join(" ")).toMatch(/were not asked for/);
  });
});

describe("Kofi searches a phrase every match answers with a page opening", () => {
  it("is told every excerpt in front of him is an opening", async () => {
    const payload = payloadOf<{ notes: string[]; excerpt_kinds: { page_opening: number } }>(
      await runSearchInside(
        fakeClient({
          archive: { insideHits: [] },
          loc: { insideHits: locInsideHits.map((hit) => ({ ...hit, wordsLocated: false })) },
        }),
        insideArgs(),
      ),
    );
    expect(payload.excerpt_kinds.page_opening).toBe(2);
    expect(payload.notes.join(" ")).toMatch(/2 of the 2 excerpts here are the opening of a page/);
  });
});
