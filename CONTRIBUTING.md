# Contributing

Thanks for looking. This is a small, single-maintainer project, and everything
below is meant to save you from writing something that then has to be rewritten.

## Where to say something

Open an issue: <https://github.com/smeet666/mcp-books/issues>

That is the right place for a bug, a question, an idea, or "this answer looks
wrong to me". The issue tracker is the only channel; anything posted on the npm
page goes unread.

## Pull requests are welcome, but talk to me first

Please open an issue before you write the code, even when you are sure of the
fix. Not to gate you: to agree on what the right answer actually is. Most of the
decisions in this repository are about what a model should be told, and two
reasonable people land on different answers. A short exchange up front is cheaper
for you than a rewrite after review.

The exception is the obviously mechanical: a typo, a dead link, a wrong version
in the documentation. Send those straight as a pull request.

## What a good report contains

The tool you called, the arguments you passed, and what came back. A single
copy-paste of the result is worth several paragraphs of description.

If the answer was wrong and not merely missing, say what you expected and why. A
link to the page on the archive itself is usually the shortest proof.

If the server returned an error code, include it. `not_found`, `rate_limited`,
`parse_failure`, `invalid_input`, `timeout` and `network_error` mean quite
different things, and the first question is always which one you saw.

For a report about a match, `per_source` is the part that matters. It says which
archives were asked, which answered, what each of their numbers counts, and what
a year means on each. An answer that looks short is very often an answer where
one archive was never asked, and the report says so.

## What this server will and will not do

It reads two public archives and returns what it reads. It writes nothing back,
holds no account, and needs no API key.

Six rules shape most of the code, and a change that breaks one of them will be
turned down however useful it looks:

- **A failure is never reported as an empty result.** An archive that could not
  be reached is named, with the reason and with the moment that failed. An
  archive that cannot answer a question is named as absent, with the reason.
  Silence about either becomes "there is none" in the mouth of a model, which is
  a false statement about the world.
- **A page number is reported only where an index holds one.** Where an index
  holds none, `page_number` is null on every match from it, and the answer says
  which archives those are. A citation naming a page an index does not know is a
  false citation.
- **An excerpt says what it is.** The text around a match and the opening of a
  page are different objects, the kind travels with every match, and the answer
  counts how many are openings.
- **Nothing is invented across archives.** No count is added to another, no
  ranking is computed on a score they do not share, no order by date spans them,
  and no vocabulary is translated between them.
- **Terms of reuse are stated per record.** They are never summed for an answer,
  and a record stating none has granted nothing.
- **The server paces itself.** Each archive is left the spacing it is owed, a
  setting can widen that and can narrow it by no path, including through the
  published client entry point.

## Running it locally

```bash
npm install
npm run typecheck
npm test
npm run build
```

The unit suite runs against stand-in archives and touches no network. It is
deterministic on purpose: time is pinned to a fixed epoch, and every assertion is
exact. A test that passes only on a fast machine is rewritten or deleted.

The live suite is opt-in and makes one request per route:

```bash
BOOKS_LIVE=1 npm run test:live
```

Run it when you have touched anything that reads an archive. Leave it alone
otherwise: one archive is a non-profit and the other a public institution, and
both serve everyone free of charge.

To drive the server by hand:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

## Where the code lives

```
src/index.ts        the executable, stdio transport
src/server.ts       tool registration and the guidance a model reads
src/tools/*.ts      arguments, rendering, notes        ← imports the MCP SDK
──────────────────────────────────────────────────────  the seam
src/sources/*.ts    asking the archives and merging them ← never imports the SDK
```

Anything the upper layer knows that the lower layer does not is a rendering
decision. Anything the lower layer knows that the upper does not is a fact about
an archive.

## Adding an archive

Write an adapter and register it in `src/sources/registry.ts`. An adapter states
five things:

- what the archive is called, and how to credit it;
- which identifiers it mints, so a raw one can be routed and an ambiguous one
  refused;
- which of the three calls it can answer, and for each one it cannot, why. An
  archive that declares it cannot be searched inside its text is named as absent
  from that tool, with the reason, rather than quietly left out;
- how to make the calls it does answer;
- what its own numbers count, what a year on its rows was measured on, whether
  its full-text index holds a leaf number, which names it files kinds of material
  under, and the spacing it is owed between two requests.

No tool, no merge and no error path has a branch per archive, so a change that
adds one anywhere else is in the wrong place. The server's own guidance is
generated from the registry, so it describes whatever the registry holds.

## Adding to the merge

The merge is the part most likely to be wrong in a way nobody notices, because a
wrong merge still looks like an answer.

- Add the case as a test first, with the sentence the answer should have carried,
  and say in the test name which rule the case is about.
- A field two archives fill differently keeps both readings and says which is
  which. It is never flattened into one, and never translated from one into the
  other.
- A null needs a reading. Say in the schema whether it means the archive
  publishes no such thing, or the record left it blank, and give the caller a way
  to tell the two apart.
- Nothing in the merge reads a clock, a network or a global beyond the archives
  themselves. Given the same rows it produces the same answer, and the tests hold
  it to that over five consecutive passes.

## Writing

Comments and documentation are read by people who have never seen this project
and will never see its history. Write what the code does and why. Do not write
what it used to do, how it compares to another version, or what was not done.
