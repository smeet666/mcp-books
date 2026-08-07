# mcp-books

## Tagline

One question, several archives: where a phrase was printed, in books and in the
press at once.

## Description

An MCP server for printed and scanned material. It reads the Internet Archive,
which holds the machine-read text of digitised books, periodicals and documents,
and the Library of Congress, which holds the text of American newspaper pages and
one catalogue per kind of material. It searches the text of both at once,
searches both catalogues at once, and reads one record from the archive its
identifier names.

The merge is the part worth having, and what makes it usable is what it refuses
to flatten. One index publishes a page number and the other publishes none, so a
match carries a real leaf on one archive and null on the other, and the answer
says which is which rather than inventing a page or dropping a true one. One
archive returns the passage that matched and the other returns the opening of the
page when the searched words sit further down than the text it sent, so every
match says which kind of excerpt it carries and the answer counts how many are
openings. The counts are reported in each archive's own terms and never added,
because one counts documents and the other counts leaves.

The server is careful about what it refuses to claim. An archive that failed is
named, with the moment that failed. An archive that cannot answer a question is
named as absent, with the reason, rather than quietly left out. Terms of reuse
are stated per record, and a record stating none has granted nothing.

## Setup Requirements

- `BOOKS_USER_AGENT` (optional): Identify your own client. The project's own identifier is appended, so an archive can always reach a human.
- `BOOKS_MIN_INTERVAL_MS` (optional): Widens the gap between two requests to one archive. Unset, each archive keeps the spacing it is owed, and this can only make it wider.
- `BOOKS_TIMEOUT_MS` (optional): Per-request deadline. Default 45000.
- `BOOKS_MAX_RETRIES` (optional): Retries on rate limiting and transient errors. Default 3.
- `BOOKS_CACHE_TTL_MS` (optional): In-memory cache lifetime. Default 900000. Set 0 to turn it off.
- `BOOKS_CACHE_MAX_ENTRIES` (optional): In-memory cache size. Default 200.
- `BOOKS_LOG_LEVEL` (optional): silent, error, info or debug. Default error, on stderr.

No API key and no account are needed. Answers take several seconds: the Library
of Congress publishes a ceiling of ten requests a minute, and this server keeps
to it.

## Category

Research & Reference

## Features

- Searches the machine-read text of every archive at the same time, and returns one list
- Says what each archive's corpus is, so a merged list is read as the addition it is
- A page number is a real leaf where an index holds one and null where none does, and the answer says which
- No page number is ever invented, and none is ever dropped
- Every match says whether its excerpt is the passage that matched or the opening of a page
- The answer counts how many excerpts are openings rather than passages
- Every excerpt is presented as what optical recognition read off a page
- Searches every catalogue at once, each archive in its own vocabulary for a kind of material
- An archive that files nothing under the name given is named as absent, with its own names listed
- Counts are reported in each archive's own terms and never added together
- No ranking across archives, and no order by date, because a year is measured on different things
- An archive that fails is named, with the moment that failed, and the others' rows still come back
- An archive that cannot answer a question is named as absent, with the reason
- Terms of reuse are stated per record, and silence is never read as permission
- Every identifier names the archive it came from, and an ambiguous one is refused rather than guessed
- Self-paced to the ceiling each archive publishes, with an honest User-Agent

## Getting Started

- "Find where the phrase 'call me ishmael' was printed, in books and in newspapers"
- "Search both archives for records about whaling before 1900"
- "Read the Internet Archive record for mobydickorwhale01melv"
- "Which archives hold maps of the Great Lakes?"
- Tool: search_inside — Finds a phrase in the machine-read text of every archive at once
- Tool: search_items — Searches every catalogue at once, each in its own vocabulary
- Tool: get_item — Reads one record, routed by the archive its identifier names

## Tags

books, archives, full-text-search, internet-archive, library-of-congress, newspapers, ocr, research, public-domain, no-api-key

## Documentation URL

https://github.com/smeet666/mcp-books#readme
