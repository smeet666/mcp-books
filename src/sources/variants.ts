/**
 * Several wordings from one question.
 *
 * An index that answers only where every word given appears returns nothing for
 * a question asked in natural language, while a shorter wording built out of
 * the same words returns a great deal, and that nothing reads as an archive
 * holding none of the thing asked about. An index that ranks the words instead
 * answers such a question with whatever it scores highest, which is rarely what
 * was asked about. Deriving the shorter wordings and asking for the union
 * answers both: it keeps a statement about a wording from being served as a
 * statement about a corpus, and it puts a wording made of the words that name
 * the thing beside the question as it was written.
 *
 * Every derivation here is made from the words the caller wrote, with no corpus
 * statistics, no dictionary, no list of words to ignore and no language model. A
 * list of words to ignore is a lexicon like any other: it belongs to one
 * language and is wrong in the next. That has two consequences worth stating. A
 * derived wording is always one a reader can retype by hand, so an answer built
 * out of several of them stays checkable. And the derivations that would need a
 * lexicon are not made at all: a run-together word is never split, and
 * diacritics are never put onto a word written without them, because either
 * would send an archive a word nobody wrote.
 *
 * What a reduction keeps is read off the writing rather than off the language.
 * A capital letter inside a sentence is the mark writing puts on a name, and a
 * name is what a catalogue files a record under, so the marked words are the
 * ones kept and a short name outranks a long word that frames the question.
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

/** How many words a reduction keeps, widest reduction first. */
const REDUCTIONS = [3, 2];

/**
 * Scripts whose combining marks are diacritics rather than letters.
 *
 * Removing a mark is only a spelling of the same word where the writing system
 * treats the mark as an ornament on a letter that exists without it. Elsewhere a
 * mark and its base are one letter of the alphabet, and taking the mark off
 * spells a word nobody writes: the Cyrillic и and й are two letters, and a
 * catalogue files no name under the first where the second was written.
 */
const FOLDABLE_SCRIPT = /\p{Script=Latin}/u;

/** A mark that combines with the character before it. */
const COMBINING_MARK = /\p{M}/u;

/** A letter a question capitalises, which is how writing marks a name. */
const OPENS_ON_CAPITAL = /^[\p{Lu}\p{Lt}]/u;

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

  const names = namesMarkedIn(asked);
  if (names.length > 0) {
    for (const keep of REDUCTIONS) {
      const picked = runsWithin(names, keep);
      if (picked.length === 0) continue;
      offer(
        picked.join(" "),
        `the ${picked.length} word(s) this question writes with a capital letter inside the sentence, in the order they were written and with a run of them kept whole: a capital there is the writing's own mark on a name, which is what a catalogue files a record under, and reading a mark needs no lexicon`,
      );
    }
  } else {
    const terms = queryTerms(asked);
    for (const keep of REDUCTIONS) {
      if (terms.length <= keep) continue;
      offer(
        longestWords(terms, keep).join(" "),
        `the ${keep} longest of the ${terms.length} words, in the order they were written: nothing in this question marks a name, so the letters are all there is to read, and a word that names a thing tends to carry more of them than a word that frames a question`,
      );
    }
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

/**
 * The names a question marks, as runs of consecutive words.
 *
 * Writing marks a name with a capital letter, and that mark is in the
 * characters rather than in the language: reading it needs no lexicon and no
 * list of words to ignore. A name is what a catalogue files a record under, so
 * the words carrying the mark are the words worth keeping, however short they
 * are, and a four-letter name outranks a nine-letter word that frames the
 * question.
 *
 * Two capitals say nothing on their own. The word a question opens with is
 * capitalised by convention, so it is read as a name only where the word after
 * it carries the mark too. And a question written wholly in capitals, or in
 * title case, marks every word and therefore marks none, so nothing is read out
 * of it.
 *
 * Consecutive marked words stay together, because a name of several words is
 * one name and half of it names something else.
 */
function namesMarkedIn(query: string): string[][] {
  const words = query
    .replace(/"/g, " ")
    .split(/[^\p{L}\p{N}'’-]+/u)
    .filter((word) => word !== "");
  const marked = words.map(
    (word, at) => OPENS_ON_CAPITAL.test(word) && (at > 0 || OPENS_ON_CAPITAL.test(words[1] ?? "")),
  );
  if (marked.every((flag) => flag)) return [];

  const runs: string[][] = [];
  for (const [at, word] of words.entries()) {
    if (!marked[at]) continue;
    if (at > 0 && marked[at - 1]) runs.at(-1)!.push(word);
    else runs.push([word]);
  }
  return runs;
}

/**
 * As many whole runs as fit in a wording of the given length.
 *
 * A run too long for what is left is passed over rather than cut, and a shorter
 * one after it can still be taken: cutting one would send half a name, and
 * stopping at it would drop a name the question also marked.
 */
function runsWithin(runs: readonly string[][], keep: number): string[] {
  const picked: string[] = [];
  for (const run of runs) {
    if (picked.length + run.length <= keep) picked.push(...run);
  }
  return picked;
}

/**
 * The longest words of a question, left in the order they were written.
 *
 * Where a question marks no name, the letters are all there is to read. It is a
 * tendency and not a rule: an interrogative can be a long word, and a thing can
 * be named by a short one. It is enough for the purpose, which is to reach the
 * words a catalogue holds rather than the words that turn a phrase into a
 * question, and it never sends a word nobody wrote.
 *
 * Words of equal length are taken as they were written, so the same question
 * always reduces to the same wording.
 */
function longestWords(terms: readonly string[], keep: number): string[] {
  return terms
    .map((word, at) => ({ word, at }))
    .sort((left, right) => right.word.length - left.word.length || left.at - right.at)
    .slice(0, keep)
    .sort((left, right) => left.at - right.at)
    .map((entry) => entry.word);
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The same words with their diacritics removed, where a diacritic is what the
 * mark is.
 *
 * A mark is dropped only from a letter written in a script that spells the
 * letter and its ornament apart. A script where the two are one letter of the
 * alphabet keeps its marks, because removing one there does not respell a word:
 * it spells a different one, which nobody wrote and no catalogue files.
 */
function foldDiacritics(value: string): string {
  let folded = "";
  let onFoldableLetter = false;
  for (const character of value.normalize("NFD")) {
    if (COMBINING_MARK.test(character)) {
      if (!onFoldableLetter) folded += character;
      continue;
    }
    onFoldableLetter = FOLDABLE_SCRIPT.test(character);
    folded += character;
  }
  return folded.normalize("NFC");
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
