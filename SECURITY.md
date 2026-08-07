# Security

## Reporting a vulnerability

Use GitHub's private reporting: **Security → Report a vulnerability** on
<https://github.com/smeet666/mcp-books/security/advisories/new>. It reaches me
without the report being public first.

Please do not open a public issue for something exploitable.

I will acknowledge within a few days. This is a single-maintainer project, so
treat that as a best effort rather than a service commitment.

## What is in scope

This server is a read-only client for two public archives, archive.org and
loc.gov. It holds no credentials, needs no API key, opens no port, and writes
nothing back. That rules out most of what a vulnerability report usually
concerns.

What remains is worth reporting:

- **Anything upstream text can do to the caller.** This is the sharpest edge
  here. Every excerpt is text a machine read off a scanned page, so anything
  printed on a page reaches a model: a page can carry a sentence addressed to
  whoever is reading. Titles, catalogue descriptions and licence wording arrive
  the same way. A path by which that text could be read as instructions rather
  than as content is in scope, and so is anything that could make it look like
  this server's own words. Foreign text is put on one line, markdown image
  syntax and angle brackets are escaped, characters that reorder the text around
  them are removed, and an opening that would pass for a line the server writes
  has its colon broken away from its word. A way past any of those is a finding.
- **Anything that lets a caller reach a host other than the ones a registered
  archive declares.** Identifiers are routed in `src/sources/ids.ts`, which
  refuses an address after an archive's prefix and refuses a path segment that
  climbs, read both as written and once its escapes are resolved. An argument
  that escapes that is a real finding.
- **Anything that turns a failure into a confident answer.** A crafted response
  that makes the server report "no archive holds this" when it means "I could
  not ask" is a correctness bug with real consequences, and I treat it as
  security.
- **Anything that defeats the pacing.** The spacing between two requests to one
  archive exists so this client cannot be turned into a load generator against a
  non-profit and a public institution. A way past it is a finding, including
  through the published client entry point.
- **Anything that makes the server do unbounded work on a bounded input.** A
  regular expression that backtracks catastrophically on a crafted excerpt, an
  archive response that drives an unbounded allocation, or an input size the
  schemas fail to bound, is in scope.
- **Dependency vulnerabilities** that are actually reachable from this code.

## What is not in scope

- **What an archive itself holds.** A scan that is wrong, offensive or
  mislabelled is a matter for the archive that holds it. This server repeats what
  it reads and links back to it.
- **Rate limiting by an archive.** Being asked to slow down is the system
  working.
- **A merged answer you disagree with.** That is a correctness report, and it
  belongs in an issue rather than an advisory. It is welcome there.

## What the server does with what it reads

Everything an archive publishes travels in two forms. The structured payload
keeps the text exactly as published. The text block puts it on a single line,
defuses markdown and markup that would fetch an address on render, removes
characters that reorder what is drawn around them, and defuses anything that
would otherwise imitate a line this server writes. Nothing fetched is executed,
evaluated, or used to build a request.

Logs go to stderr and never to stdout, because stdout carries the protocol and a
stray line there corrupts the session.
