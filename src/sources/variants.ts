/**
 * Several wordings from one question.
 *
 * The full-text and catalogue indexes behind these archives are conjunctive:
 * every word given has to appear in the same document for it to match. A
 * question asked in natural language therefore returns nothing while a shorter
 * wording built out of the same words returns a great deal, and that nothing
 * reads as an archive holding none of the thing asked about. Deriving the
 * shorter wordings and asking for the union is what keeps a statement about a
 * wording from being served as a statement about a corpus.
 *
 * Every derivation here is made from the words the caller wrote, with no corpus
 * statistics, no dictionary and no language model. That has two consequences
 * worth stating. A derived wording is always one a reader can retype by hand,
 * so an answer built out of several of them stays checkable. And the derivations
 * that would need a lexicon are not made at all: a run-together word is never
 * split, and diacritics are never put onto a word written without them, because
 * either would send an archive a word nobody wrote.
 *
 * The order is the order they are tried in, and it runs from the wording
 * closest to what was asked to the widest. Reductions come before spellings,
 * because the number of words is what a long question fails on and a spelling
 * is what a short one fails on.
 */

import { queryTerms } from "./adapter.js";

/** One wording, and how it was arrived at. */
export interface QueryVariant {
  query: string;
  /** How this wording was derived from the question, in words. */
  derivation: string;
}

/**
 * The most requests one archive receives for one call.
 *
 * A ceiling rather than a budget shared out, because each archive is paced on
 * its own and the wordings are sent to it one after another. Three is what
 * keeps the slowest archive's worst case at three of its own intervals while
 * still reaching a reduction: the question as asked, one reduction, and one
 * more.
 */
export const MAX_QUERIES_PER_SOURCE = 3;

/** How many leading words a reduction keeps, narrowest reduction first. */
const REDUCTIONS = [3, 2];

/** Words shorter than this are not worth running into their neighbour. */
const SHORTEST_JOINABLE_WORD = 3;

export function deriveQueries(query: string): QueryVariant[] {
  const asked = tidy(query);
  const variants: QueryVariant[] = [];
  const seen = new Set<string>();

  const offer = (candidate: string, derivation: string): void => {
    const clean = tidy(candidate);
    if (clean === "") return;
    // Two wordings differing only in case or spacing are one wording to these
    // indexes, and sending both spends an interval to learn nothing.
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ query: clean, derivation });
  };

  offer(asked, "the words as asked");

  if (/"[^"]*"/.test(asked)) {
    offer(
      asked.replace(/"/g, " "),
      "the quoted phrase without its quotation marks, so an index that requires those words adjacent can match them apart",
    );
  }

  offer(
    asked.normalize("NFC"),
    "the same characters in Unicode's composed form, which an index can hold in place of the decomposed one",
  );

  const terms = queryTerms(asked);
  for (const keep of REDUCTIONS) {
    if (terms.length <= keep) continue;
    offer(
      terms.slice(0, keep).join(" "),
      `the leading ${keep} of the ${terms.length} words a match has to carry, because every one of them has to appear and the words naming the thing are written before the words framing the question`,
    );
  }

  const folded = foldDiacritics(asked);
  offer(
    folded,
    "the same words with their diacritics removed, because a catalogue and the text read off a page can hold either spelling",
  );

  offer(
    runTogether(asked) ?? "",
    "the two words run together, because a name is filed as one word in one place and as two in another",
  );
  offer(
    runTogether(folded) ?? "",
    "the two words run together and their diacritics removed, which is how a transliterated name is filed in some catalogues",
  );

  return variants;
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
}

/**
 * Two words as one.
 *
 * Only two, because joining every word of a longer question makes a string no
 * index holds. The reverse move, cutting one word into two, is not made: where
 * the cut falls is a fact about the language and not about the characters.
 */
function runTogether(value: string): string | null {
  const words = tidy(value.replace(/"/g, " ")).split(" ");
  if (words.length !== 2) return null;
  if (words.some((word) => word.length < SHORTEST_JOINABLE_WORD)) return null;
  return words.join("");
}
