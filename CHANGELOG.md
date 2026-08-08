# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
