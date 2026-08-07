# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
