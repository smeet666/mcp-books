# Changelog

## 2.0.0

- **This server now needs node 24 or later.** Node 20 reached its end of
  support on 2026-04-30 and node 22 is no longer what this code is built and
  typed against. That is what makes this a major version: an install on an
  older node is refused rather than left to fail somewhere later.
- **Every refusal of an argument opens with `invalid_input`.** A value outside
  its bounds, of the wrong type, or outside the set an argument reads used to
  come back in the validator's own words, with no code to branch on.
- **A container image is published for each version**, on ghcr, for amd64 and
  arm64. The readme carries the configuration that runs it.
- The published package carries its changelog, and the entry point it declares
  for the package root now publishes its types.

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.2.4

### Fixed

- A full-text search whose backend failed inside the Internet Archive is reported
  as an archive that did not answer, rather than as a search written wrongly. The
  Archive answers such a failure with the status it also uses to refuse a
  request, and the reading of it now tells a reason about the query from one
  naming a service of the Archive's own that did not respond.

## 1.2.3

### Fixed

- A full-text search the Internet Archive declined to serve at that moment is
  reported as an archive that did not answer, rather than as a search the caller
  wrote wrongly. The Archive uses one status for a request it objects to and for
  one it will not serve, and the reading of it now separates the two on whether
  the Archive stated a reason. A well-formed search could come back naming the
  Internet Archive as having refused it and advising a check of its quotation
  marks, while the same words were answered a minute later.

## 1.2.2

### Fixed

- The live suite gives each test the time the client is entitled to spend,
  counted from the deadline it keeps over one archive rather than written by
  hand. That deadline covers every attempt, the pacing owed before each of them
  and the wait an archive can ask the server to keep, and reaching it raises an
  error naming the archive and the moment it gave up. The suite's own ceiling
  was shorter than it, so an archive that answered slowly was reported as a bare
  test timeout naming neither archive nor stage, and a slow night read exactly
  like an archive that had changed the shape of what it publishes.

### Added

- `BooksClient` publishes `slowestDeadlineMs`, the longest one read of one
  archive can take before the client gives up and says so, and
  `slowestAnswerMs`, the same figure over the ladder of wordings one search may
  send. A caller holding a deadline of its own can size it from these rather
  than from a number that drifts as settings change.

## 1.2.1

- The README carries the same badge row as every server here: npm, CI, the
  licence, the MCP registry entry, the Glama score, and one-click installs for
  Cursor and VS Code. Each install link encodes this package. npm serves the
  README frozen at publish time, so a release is what puts it there.

## 1.2.0

### Fixed

- A year range whose earliest bound is later than its latest is refused rather
  than sent. One archive answered such a pair with nothing and another answered
  as though no range had been given, while the answer reported the range as
  applied on every archive in it and `filters_dropped` stayed empty.
- A long question reduces to the words it writes with a capital letter inside
  the sentence, in the order they were written and without cutting through a run
  of them, and falls back to its longest words only where it marks no name at
  all. Ranking words by their length threw away a four-letter name in favour of
  a nine-letter word that framed the question, so a question about Victor Hugo
  came back with an abbey of Saint-Victor, and `did Poe write about the raven`
  was reduced to `write about`. A capital is a mark in the characters, so
  reading it needs no list of words to ignore, which would be a lexicon tied to
  one language.
- The notes that qualify an answer are never dropped from the text block in
  silence. A block with room for only some of them drops the ones qualifying it
  least, and when only qualifying notes are left it says how many were left out
  and that they are in `notes` in the structured output, in full. The room set
  aside for them is sized against an answer merged from several archives rather
  than one archive's, and the rendered rows give way to them, since every row is
  in the structured output with its identifier and its address. A three-archive
  catalogue answer rendered 8 of its 18 notes, dropping among others the caveat
  on an index reading titles alone, the caveat on an index that scores the words
  rather than requiring them all, a narrowing one catalogue never received, and
  the terms-of-reuse note.
- An answer holding no row because no row could be read is no longer reported as
  every archive holding nothing under the wording. An archive that dropped rows
  this server could not read, or that counted matches and returned none of them,
  is named with what it did, and the caller is not sent to rewrite a question
  that was answered.
- The spelling without diacritics is derived only for scripts that write a
  letter and its ornament apart. Removing a combining mark elsewhere spells a
  different word: `Достоевский` became `Достоевскии`, and й is a letter of its own.
- A digitised document a national library's catalogue attaches to illustrate a
  record is no longer counted in `copies_available`, whose schema says it counts
  what a reader can open. Only a reproduction of an edition and the text a
  machine read off one stand for the work; the rest are counted in
  `generated_entries`, whose description now covers an image attached to a
  record alongside an archive's bookkeeping and the by-products of its
  processing.
- Every match and every row carries `found_by_query` and `found_by_derivation`,
  naming the wording it came back under, and the text block marks a row a
  derived wording returned. Which wording reached a row is what says how much of
  the question that row answers.
- An archive's own total is reported as counting the wording it was reported
  for, and `more_on_this_archive` is null, wherever a further wording brought
  back rows that total never counted. A count of nothing could otherwise sit
  above rows the same archive published.
- The per-archive description blocks in `per_source` are those of the index the
  call actually read: a full-text answer carries the corpus and no catalogue
  fields, a catalogue answer carries the fields and no corpus, and an archive
  that was not asked carries neither.
- An archive whose catalogue index reads titles alone says what that does to a
  person's name whenever it contributed rows, including when it is the only
  archive that did. The caveat is written per archive, so it is no longer said
  of an answer where no such index was read.
- An empty page beyond the first is reported as the rows stopping short of that
  page rather than as the archives holding nothing under the wording.
- A character in a query that is neither a letter nor a digit no longer sits
  under a flag promising every word given appears. `🐋 whale 🐋` came back with
  rows carrying no emoji while `requires_every_word` read true, and the answer
  said nothing about the character. The characters are now listed in
  `non_word_characters` on both searches, a note names them with their code
  points, and the flag says it covers the words that were given.
- An identifier carrying a control character is refused rather than sent. The
  character travelled to the archive and was stripped out of every line quoting
  it, so the answer named a record nobody had asked about and stated its absence
  under that name. The refusal quotes no identifier at all, since quoting one
  would print the spelling that differs from the one that would have been sent.
- A record an archive answered about and served no whole record for is no longer
  put to the caller as a defect to open a bug report about. An archive keeps no
  record of its own for some of the identifiers its search hands back, and the
  refusal now says so and sends the caller to the address the row carried.
- `get_item` says what an archive files under the field it reads a description
  out of, in `description_means` and in a note. That field holds the place of
  publication on a catalogued newspaper and the extent of the volume on a scan
  catalogued from a library record, and both arrived as the record's prose.
- A row's `media_type` is named as the word its own record carries, apart from
  the names the `media_type` argument takes: a catalogue answered with rows
  reading `photo, print, drawing`, which is in neither vocabulary published
  beside them. A note lists such words per archive, and the vocabulary published
  in `media_types` says it is what the argument takes.
- A sentence about one archive names that archive. The archives are not all
  archives, and a warning written about "the archive" was served under a
  library's own count, under a wording withheld after its search failed, in the
  refusal for a record it served none of, and on an answer kept in a cache. The
  merged answer also names which archives its cached rows came from, rather than
  saying part of it came from a cache.
- The caveat that an excerpt is machine-read text is carried by an answer that
  holds an excerpt. An archive answers a search of its text with a row and none
  of the text behind it, and such a match was rendered as a title and an address
  under a note describing passages the answer did not have. A match that came
  back with no machine-read text now says so where it is rendered, and the notes
  count those matches.
- `skipped` is a count on every answer. It read as a number where an archive had
  just been read and as null where the same rows came out of a cache, so two
  identical calls published one field in two shapes. Rows in hand are counted
  the same way either way, and `cached` is where a caller sees that a count can
  be short of a drop nobody kept a record of.
- A catalogue row's address carries none of the words that were searched for. A
  catalogue search came back with rows addressed at a chosen leaf of a resource
  with the query glued on, which reads as a place those words were printed while
  `row_describes` says the row is a catalogue record.

### Added

- `requires_every_word` in `per_source`, and prose that no longer assumes every
  index answers only where every word given appears. One catalogue here scores
  the words instead and answers with the records it ranks highest, so a row of
  its can carry only some of them, and the answer says so where it contributed.

## [1.1.0] - 2026-08-08

### Added

- A third archive: data.bnf.fr, the open catalogue of the Bibliothèque nationale
  de France. It answers `search_items` and `get_item`, and is named as absent
  from `search_inside` with the reason, since it describes a catalogue and holds
  no text of its own.
- `searches_on` in `per_source`, naming the fields each archive matched the query
  against, with a note when they differ. An index over a whole record and an
  index over titles alone answer a person's name with different books, so one
  query put to several archives is several questions.
- `filters_dropped` in `per_source`, naming every narrowing an archive never
  received and why. A narrowing an archive's catalogue cannot apply is left out
  of the request sent to it rather than sent and ignored.
- `row_describes` in `per_source` and `identifier_provisional` on a row and on a
  record. A row is a copy on one archive, a catalogue record on another and a
  work as an entity on a third, and an identifier an archive calls provisional
  can be replaced once a cataloguer settles the record.
- `attribution` in `per_source`, carrying the credit each archive asks for. An
  archive publishing on the condition that the date of retrieval is stated
  carries that date, in the report and in the credit line at the foot of the
  text block.
- `covers` on a record's terms of reuse, for an archive publishing its whole
  catalogue on one condition rather than setting terms per deposit.
- Several wordings from one question. `search_inside` and `search_items` derive
  shorter and differently spelled queries from the words given, ask each archive
  for the union of what they return, and deduplicate it on the namespaced
  identifier. The indexes require every word given to appear, so a question
  written as a sentence used to come back empty on a work the archives hold
  several copies of.
- `fan_out`, which turns the derivation off for a caller who knows exactly what
  to send, and `queries_run`, which counts the requests that went out.
- `queries` in `per_source`, holding every wording with what it returned, why any
  was withheld, and any that failed, so an answer can be redone by hand.

### Changed

- An archive that answered nothing under every wording says so, rather than
  offering fewer words as the next move when fewer words were already tried.
- `search_inside` places a match whose excerpt carries the searched words ahead
  of a match whose excerpt is the opening of a page and carries them nowhere.
  The order runs on what each row states about its own excerpt, so no score is
  compared across archives; no match is dropped for it, the interleaving holds
  inside each group, and `order` says what the placement rests on. An answer
  whose matches are all of one kind claims no such order.
- `search_items` qualifies `oldest` and `newest`. They run on a date field
  carrying a year and no era, which files a date before the common era as a year
  of this one, and a record stating no date is placed there by a stand-in rather
  than by its age. The answer says so and counts the rows it is returning that
  carry no year.

## [1.0.0] - 2026-08-07

First release.

### Added

- `search_inside`, which reads the machine-read text of every archive that holds
  any and returns one list of where a phrase was printed. The corpora are
  different bodies of material, so the answer is those corpora put together and
  says so.
- `search_items`, which reads every catalogue at once, each archive in its own
  vocabulary for a kind of material.
- `get_item`, which reads one record from the archive its identifier names.
- Two archives: the Internet Archive and the Library of Congress, each read
  through its own published client library and each left the spacing it is owed.
- A published `./client` entry point, carrying the merge with no protocol
  attached, and taking stand-in readers or a registry of its own.
