# mcp-books

[![npm](https://img.shields.io/npm/v/mcp-books.svg)](https://www.npmjs.com/package/mcp-books)
[![CI](https://github.com/smeet666/mcp-books/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-books/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-books.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-books)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-books/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-books)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-books-1kpajy?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-books-1kpajy)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=books&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1ib29rcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=books&config=%7B%22name%22%3A%22books%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-books%22%5D%7D)

<!-- m8ven-verify: 9550b67f15a2d999bf8a5859c9368aeb -->

Three great archives hold the scanned record of what was published, and each
describes it in its own words. The [Internet Archive](https://archive.org) keeps
books, films, recordings and software deposited by anyone, and has run millions
of them through optical character recognition. The
[Library of Congress](https://www.loc.gov) publishes the national collections of
the United States, one catalogue per kind of material. [data.bnf.fr](https://data.bnf.fr)
publishes the authority records of the Bibliothèque nationale de France, which
describe works and the people who wrote them rather than copies.

This server reads all three with one question. You can search the words inside
the scanned documents, search the catalogues, and read one record in a single
shape whichever archive holds it. It needs no API key and no account.

_[Version française](#mcp-books-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=books&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1ib29rcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=books&config=%7B%22name%22%3A%22books%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-books%22%5D%7D)

**Claude Code**

```bash
claude mcp add books -- npx -y mcp-books
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "books": {
      "command": "npx",
      "args": ["-y", "mcp-books"]
    }
  }
}
```

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "books": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-books:2.0.1"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`archive.org`, `openlibrary.org`, `www.loc.gov` and `data.bnf.fr`, and nothing
else: no volume, no port, no credential.

### Bundle, without npm

Download `mcp-books-2.0.1.mcpb` from
[the latest release](https://github.com/smeet666/mcp-books/releases/latest) and
open it. A client that supports MCP bundles installs it on its own, with no npm
and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "Which books mention the Beaumont light-house?"
- "Find me anything on the 1906 San Francisco earthquake."
- "Read me that record and tell me who holds the original."
- "What does the BnF have on that author?"
- "Search the photographs rather than the books."

An answer takes several seconds: three archives are asked, each at its own pace.

## The three sources

| Source    | Archive                              | What it describes                                |
| --------- | ------------------------------------ | ------------------------------------------------ |
| `archive` | the Internet Archive                 | deposited copies, of every kind                  |
| `loc`     | the Library of Congress              | the national collections, one catalogue per kind |
| `bnf`     | the Bibliothèque nationale de France | works and the people who wrote them              |

A row's `id` names its archive, so an identifier read from one answer goes back
to the right one. **Counts are never added across archives**, and an archive that
failed is reported as having failed rather than as having found nothing.

## Tools

| Tool            | What it does                                                       |
| --------------- | ------------------------------------------------------------------ |
| `search_inside` | Searches the words inside the scanned documents.                   |
| `search_items`  | Searches the catalogues by title, creator, subject or plain words. |
| `get_item`      | Reads one record in a single shape, whichever archive holds it.    |

### `search_inside`

Searches the text inside the scanned documents, which came off the page through
optical character recognition.

| Argument                 | Type                               | Required | What it does                                                      |
| ------------------------ | ---------------------------------- | -------- | ----------------------------------------------------------------- |
| `query`                  | string, 2 to 300 characters        | yes      | The phrase to look for inside the documents.                      |
| `limit`                  | integer, 1 to 25, default `3`      | no       | Matches to keep from each archive.                                |
| `page`                   | integer, 1 to 100, default `1`     | no       | Which page of matches.                                            |
| `max_excerpt_chars`      | integer, 80 to 1200, default `300` | no       | How much of a passage to serve.                                   |
| `max_excerpts_per_match` | integer, 1 to 10, default `2`      | no       | Passages served per matching document.                            |
| `fan_out`                | boolean, default `true`            | no       | Ask every archive rather than stopping at the first that answers. |
| `sources`                | array of source ids                | no       | Ask these archives alone.                                         |

**In return:** `hits`, each carrying `id`, which `get_item` takes and which names
its archive; `source` and `source_name`; the archive's own `identifier` without
the prefix; `title`, `creator` and `year`; `page_number` where the archive states
one; `excerpts`; and `excerpt_kind`.

**`excerpt_kind` decides what an excerpt is worth.** A `passage` is the text
around the words that matched. A `page_opening` is the start of the page, sent
because the machine-read text the archive returned stops before those words
appear: it does not carry the match, so quoting it quotes something else. All the
excerpts of one match are of one kind.

### `search_items`

Searches the catalogues.

| Argument     | Type                                                            | Required | What it does                                   |
| ------------ | --------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `query`      | string, 1 to 300 characters                                     | yes      | A title, a creator, a subject, or plain words. |
| `media_type` | a kind one of the archives holds                                | no       | Which kind of material to search.              |
| `year_from`  | integer, 1000 to 2100                                           | no       | Earliest year.                                 |
| `year_to`    | integer, 1000 to 2100                                           | no       | Latest year.                                   |
| `sort`       | `relevance`, `newest`, `oldest` or `title`, default `relevance` | no       | How the rows are ordered.                      |
| `limit`      | integer, 1 to 25, default `5`                                   | no       | Rows to keep from each archive.                |
| `page`       | integer, 1 to 100, default `1`                                  | no       | Which page of rows.                            |
| `fan_out`    | boolean, default `true`                                         | no       | Ask every archive.                             |
| `sources`    | array of source ids                                             | no       | Ask these archives alone.                      |

The three archives divide their material differently. The Internet Archive
searches every kind at once when none is named; the Library of Congress is one
route per kind, so a search naming none is told which one was read; and the BnF
search reads works. A `media_type` one archive has no notion of leaves that
archive out, and the answer says so.

**In return:** rows in the shape a hit carries, with `per_source` giving one
report per archive: its `status`, the `count` it contributed, its
`reported_total` and `reported_total_means`, which says what that number counts
there.

### `get_item`

Reads one record in a single shape, whichever archive holds it.

| Argument         | Type                                                                               | Required | What it does              |
| ---------------- | ---------------------------------------------------------------------------------- | -------- | ------------------------- |
| `identifier`     | string, 1 to 500 characters                                                        | yes      | The `id` a row carries.   |
| `sections`       | array of `description`, `subjects`, `copies`, `context`, default `["description"]` | no       | Which parts to return.    |
| `max_copies`     | integer, 1 to 50, default `10`                                                     | no       | Copies to list.           |
| `text_offset`    | integer, 0 to 1000000, default `0`                                                 | no       | Where to resume the text. |
| `max_text_chars` | integer, 200 to 8000, default `1500`                                               | no       | How much text to serve.   |

**In return:** the record with its `id`, `source` and `source_name`, the
archive's own `identifier`, `title`, `creator`, `date` exactly as published, and
`year` beside `year_means`, which says what that year is the year of, since the
three archives date a record differently. `attribution` is what that archive asks
to be credited with, and `identifier_provisional` says when the identifier was
built rather than read, so a caller knows it may not resolve.

## What an answer states about the archives

Every answer accounts for each archive separately. One that failed, one nobody
asked, and one that answered with nothing are three different things, and they
are reported as three. A total stays beside the archive that published it, with
what that archive counts when it says it: one counts documents, another counts
newspaper leaves.

## What scanned text is worth

The words inside a scanned document came off the page through optical character
recognition. An excerpt carries the misreadings of that process, and it is served
as it was read rather than corrected. Quote it as scanned text, and link the
record so a reader can look at the page.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                  | Default                 | What it does                                                                                                                                                                        |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOOKS_USER_AGENT`        | the project identity    | Names your application to the three archives, with an address where a person can be reached.                                                                                        |
| `BOOKS_MIN_INTERVAL_MS`   | each archive's own pace | Widens the gap between two requests to one archive, from 500 to 60000. Left unset, every archive keeps the pace it publishes, and a figure set here applies only where it is wider. |
| `BOOKS_TIMEOUT_MS`        | `45000`                 | Deadline for one request, from 1000 to 120000.                                                                                                                                      |
| `BOOKS_MAX_RETRIES`       | `3`                     | Attempts after a transient failure, from 0 to 8.                                                                                                                                    |
| `BOOKS_CACHE_TTL_MS`      | `900000`                | How long an answer stays in memory, from 0 to 86400000.                                                                                                                             |
| `BOOKS_CACHE_MAX_ENTRIES` | `200`                   | Answers held in memory at once, from 1 to 5000.                                                                                                                                     |
| `BOOKS_LOG_LEVEL`         | `error`                 | `silent`, `error`, `info` or `debug`, written to stderr.                                                                                                                            |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                      |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `not_found`     | An archive answered, and holds no such record.          | Check the identifier with `search_items`.                                       |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                     |
| `rate_limited`  | An archive asked this client to slow down.              | Wait, then call again with the same arguments. The record is still there.       |
| `parse_failure` | An answer arrived in a shape this client cannot read.   | Report it at [the issue tracker](https://github.com/smeet666/mcp-books/issues). |
| `network_error` | The request did not complete.                           | Try again shortly.                                                              |
| `timeout`       | The request passed its deadline.                        | Raise `BOOKS_TIMEOUT_MS`, or ask for fewer rows.                                |

An archive that failed is reported per archive rather than failing the whole
answer, so one silent archive never hides the others.

## As a library

The layer reading the three archives is published on its own, with its pacing,
its cache and its errors, and with no protocol attached.

```ts
import { BooksClient } from "mcp-books/client";

const client = new BooksClient();
const read = await client.searchItems({ query: "beaumont light-house", limit: 3 });
console.log(read.data.rows.length);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. Each archive keeps its own pace, and its floor holds here as well.

## Pacing and attribution

Each archive is paced on its own, one request at a time, and the widest of its
own floor and the configured interval governs: the Library of Congress publishes
the slowest, and asking all three at once therefore costs each of them one
request rather than three. The `User-Agent` always ends with the project identity
and an address where a person can be reached.

Every record carries the address of its page and the `attribution` its archive
asks for. The Internet Archive items belong to their depositors, the Library of
Congress records state their own rights, and the BnF asks that the source and the
date of retrieval be stated wherever its metadata are shown.

This MCP server is an unofficial project, with no affiliation to any of the
archives it reads.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `archive.org`, `openlibrary.org`, `www.loc.gov` and
`data.bnf.fr` and nothing else, holds its answers in memory while it runs, and
writes nothing to disk. [PRIVACY.md](PRIVACY.md) states what a request carries
and which settings change any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
archives themselves.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-books/issues). Pull requests
are welcome; opening an issue first helps agree on the shape of the change. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The records belong to the archives that published
them and to their depositors.

---

<a name="mcp-books-français"></a>

# mcp-books (français)

_[English version](#mcp-books)_

Trois grandes archives conservent la trace numérisée de ce qui a été publié, et
chacune la décrit dans ses propres mots. L'[Internet Archive](https://archive.org)
garde les livres, les films, les enregistrements et les logiciels que chacun y
dépose, et en a passé des millions par la reconnaissance optique de caractères.
La [Library of Congress](https://www.loc.gov) publie les collections nationales
des États-Unis, un catalogue par type de document.
[data.bnf.fr](https://data.bnf.fr) publie les notices d'autorité de la
Bibliothèque nationale de France, qui décrivent des œuvres et ceux qui les ont
écrites plutôt que des exemplaires.

Ce serveur lit les trois avec une seule question. On peut chercher dans les mots
contenus dans les documents numérisés, chercher dans les catalogues, et lire une
notice sous une forme unique quelle que soit l'archive qui la détient. Aucune clé
d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=books&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1ib29rcyJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=books&config=%7B%22name%22%3A%22books%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-books%22%5D%7D)

**Claude Code**

```bash
claude mcp add books -- npx -y mcp-books
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

```json
{
  "mcpServers": {
    "books": {
      "command": "npx",
      "args": ["-y", "mcp-books"]
    }
  }
}
```

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "books": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-books:2.0.1"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `archive.org`, `openlibrary.org`, `www.loc.gov` et `data.bnf.fr`, et
de rien d'autre : aucun volume, aucun port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-books-2.0.1.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-books/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Quels livres mentionnent le phare de Beaumont ? »
- « Trouve-moi ce qu'il y a sur le tremblement de terre de San Francisco en 1906. »
- « Lis-moi cette notice et dis-moi qui conserve l'original. »
- « Qu'est-ce que la BnF a sur cet auteur ? »
- « Cherche dans les photographies plutôt que dans les livres. »

Une réponse prend plusieurs secondes : trois archives sont interrogées, chacune à
son rythme.

## Les trois sources

| Source    | Archive                             | Ce qu'elle décrit                                 |
| --------- | ----------------------------------- | ------------------------------------------------- |
| `archive` | l'Internet Archive                  | les exemplaires déposés, de tout type             |
| `loc`     | la Library of Congress              | les collections nationales, un catalogue par type |
| `bnf`     | la Bibliothèque nationale de France | les œuvres et ceux qui les ont écrites            |

L'`id` d'une ligne nomme son archive, donc un identifiant lu dans une réponse
retourne vers la bonne. **Les comptes ne sont jamais additionnés entre
archives**, et une archive qui a échoué est rapportée comme ayant échoué plutôt
que comme n'ayant rien trouvé.

## Les outils

| Outil           | Ce qu'il fait                                                         |
| --------------- | --------------------------------------------------------------------- |
| `search_inside` | Cherche dans les mots contenus dans les documents numérisés.          |
| `search_items`  | Cherche dans les catalogues par titre, auteur, sujet ou mots simples. |
| `get_item`      | Lit une notice sous une forme unique, quelle que soit l'archive.      |

### `search_inside`

Cherche dans le texte contenu dans les documents numérisés, texte issu de la
reconnaissance optique de caractères.

| Argument                 | Type                             | Requis | Ce qu'il fait                                                            |
| ------------------------ | -------------------------------- | ------ | ------------------------------------------------------------------------ |
| `query`                  | chaîne, 2 à 300 caractères       | oui    | La phrase à chercher dans les documents.                                 |
| `limit`                  | entier, 1 à 25, défaut `3`       | non    | Correspondances à garder de chaque archive.                              |
| `page`                   | entier, 1 à 100, défaut `1`      | non    | Quelle page de correspondances.                                          |
| `max_excerpt_chars`      | entier, 80 à 1200, défaut `300`  | non    | La longueur de passage à servir.                                         |
| `max_excerpts_per_match` | entier, 1 à 10, défaut `2`       | non    | Passages servis par document correspondant.                              |
| `fan_out`                | booléen, défaut `true`           | non    | Interroger chaque archive plutôt que s'arrêter à la première qui répond. |
| `sources`                | tableau d'identifiants de source | non    | N'interroger que ces archives.                                           |

**En retour :** `hits`, chacun portant `id`, que `get_item` reprend et qui nomme
son archive ; `source` et `source_name` ; l'`identifier` propre à l'archive, sans
le préfixe ; `title`, `creator` et `year` ; `page_number` là où l'archive en
indique un ; `excerpts` ; et `excerpt_kind`.

**`excerpt_kind` décide de ce que vaut un extrait.** Un `passage` est le texte
autour des mots trouvés. Un `page_opening` est le début de la page, envoyé parce
que le texte lu par machine que l'archive a rendu s'arrête avant que ces mots
apparaissent : il ne porte pas la correspondance, donc le citer cite autre chose.
Tous les extraits d'une correspondance sont d'un seul type.

### `search_items`

Cherche dans les catalogues.

| Argument     | Type                                                           | Requis | Ce qu'il fait                                       |
| ------------ | -------------------------------------------------------------- | ------ | --------------------------------------------------- |
| `query`      | chaîne, 1 à 300 caractères                                     | oui    | Un titre, un auteur, un sujet, ou des mots simples. |
| `media_type` | un type que l'une des archives détient                         | non    | Le type de document à chercher.                     |
| `year_from`  | entier, 1000 à 2100                                            | non    | Année la plus ancienne.                             |
| `year_to`    | entier, 1000 à 2100                                            | non    | Année la plus récente.                              |
| `sort`       | `relevance`, `newest`, `oldest` ou `title`, défaut `relevance` | non    | L'ordre des lignes.                                 |
| `limit`      | entier, 1 à 25, défaut `5`                                     | non    | Lignes à garder de chaque archive.                  |
| `page`       | entier, 1 à 100, défaut `1`                                    | non    | Quelle page de lignes.                              |
| `fan_out`    | booléen, défaut `true`                                         | non    | Interroger chaque archive.                          |
| `sources`    | tableau d'identifiants de source                               | non    | N'interroger que ces archives.                      |

Les trois archives découpent leurs fonds différemment. L'Internet Archive cherche
dans tous les types à la fois quand aucun n'est nommé ; la Library of Congress a
une route par type, donc une recherche qui n'en nomme aucun se voit dire lequel a
été lu ; et la recherche de la BnF lit des œuvres. Un `media_type` dont une
archive n'a pas la notion l'écarte de la réponse, et la réponse le dit.

**En retour :** des lignes dans la forme d'un `hit`, avec `per_source` qui donne
un rapport par archive : son `status`, le `count` qu'elle a fourni, son
`reported_total` et `reported_total_means`, qui dit ce que ce nombre compte
là-bas.

### `get_item`

Lit une notice sous une forme unique, quelle que soit l'archive qui la détient.

| Argument         | Type                                                                                | Requis | Ce qu'il fait                  |
| ---------------- | ----------------------------------------------------------------------------------- | ------ | ------------------------------ |
| `identifier`     | chaîne, 1 à 500 caractères                                                          | oui    | L'`id` que porte une ligne.    |
| `sections`       | tableau de `description`, `subjects`, `copies`, `context`, défaut `["description"]` | non    | Les parties à rendre.          |
| `max_copies`     | entier, 1 à 50, défaut `10`                                                         | non    | Exemplaires à lister.          |
| `text_offset`    | entier, 0 à 1000000, défaut `0`                                                     | non    | Où reprendre le texte.         |
| `max_text_chars` | entier, 200 à 8000, défaut `1500`                                                   | non    | La longueur de texte à servir. |

**En retour :** la notice avec son `id`, `source` et `source_name`,
l'`identifier` propre à l'archive, `title`, `creator`, `date` exactement telle
que publiée, et `year` accompagné de `year_means`, qui dit de quoi cette année
est l'année, les trois archives datant une notice différemment. `attribution` est
ce que cette archive demande qu'on lui crédite, et `identifier_provisional` dit
quand l'identifiant a été construit plutôt que lu, pour qu'un appelant sache
qu'il peut ne pas résoudre.

## Ce qu'une réponse dit des archives

Chaque réponse rend compte de chaque archive séparément. Une qui a échoué, une
que personne n'a interrogée et une qui a répondu vide sont trois choses
différentes, et elles sont rapportées comme trois. Un total reste à côté de
l'archive qui l'a publié, avec ce que cette archive compte en le disant : l'une
compte des documents, une autre des feuillets de journaux.

## Ce que vaut un texte numérisé

Les mots contenus dans un document numérisé sont issus de la reconnaissance
optique de caractères. Un extrait porte les erreurs de lecture de ce procédé, et
il est servi tel qu'il a été lu plutôt que corrigé. Citez-le comme un texte
numérisé, et liez la notice pour qu'un lecteur puisse regarder la page.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                  | Défaut                            | Ce qu'elle fait                                                                                                                                                                                           |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOOKS_USER_AGENT`        | l'identité du projet              | Nomme votre application auprès des trois archives, avec une adresse où joindre une personne.                                                                                                              |
| `BOOKS_MIN_INTERVAL_MS`   | le rythme propre à chaque archive | Élargit l'écart entre deux requêtes vers une même archive, de 500 à 60000. Non posée, chaque archive garde le rythme qu'elle publie, et une valeur posée ici ne s'applique que là où elle est plus large. |
| `BOOKS_TIMEOUT_MS`        | `45000`                           | Délai d'une requête, de 1000 à 120000.                                                                                                                                                                    |
| `BOOKS_MAX_RETRIES`       | `3`                               | Tentatives après un échec passager, de 0 à 8.                                                                                                                                                             |
| `BOOKS_CACHE_TTL_MS`      | `900000`                          | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.                                                                                                                                     |
| `BOOKS_CACHE_MAX_ENTRIES` | `200`                             | Réponses gardées en mémoire à la fois, de 1 à 5000.                                                                                                                                                       |
| `BOOKS_LOG_LEVEL`         | `error`                           | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                                                                                                                                       |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                    | Que faire                                                                             |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `not_found`     | Une archive a répondu, et n'a pas cette notice.       | Vérifiez l'identifiant avec `search_items`.                                           |
| `invalid_input` | Les arguments ont été refusés avant toute requête.    | Lisez le message, qui nomme l'argument.                                               |
| `rate_limited`  | Une archive demande à ce client de ralentir.          | Attendez, puis rappelez avec les mêmes arguments. La notice est toujours là.          |
| `parse_failure` | Une réponse est arrivée dans une forme illisible ici. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-books/issues). |
| `network_error` | La requête n'a pas abouti.                            | Réessayez sous peu.                                                                   |
| `timeout`       | La requête a dépassé son délai.                       | Augmentez `BOOKS_TIMEOUT_MS`, ou demandez moins de lignes.                            |

Une archive qui échoue est rapportée archive par archive plutôt que de faire
échouer toute la réponse, donc une archive silencieuse n'en cache jamais
d'autres.

## Comme bibliothèque

La couche qui lit les trois archives est publiée seule, avec son rythme, son
cache et ses erreurs, sans protocole attaché.

```ts
import { BooksClient } from "mcp-books/client";

const client = new BooksClient();
const read = await client.searchItems({ query: "beaumont light-house", limit: 3 });
console.log(read.data.rows.length);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Chaque archive garde son propre rythme, et son plancher tient également
ici.

## Rythme et attribution

Chaque archive est cadencée pour elle-même, une requête à la fois, et c'est le
plus large de son propre plancher et de l'intervalle configuré qui gouverne : la
Library of Congress publie le plus lent, et interroger les trois à la fois coûte
donc à chacune une requête plutôt que trois. Le `User-Agent` se termine toujours
par l'identité du projet et une adresse où joindre une personne.

Chaque notice porte l'adresse de sa page et l'`attribution` que son archive
demande. Les documents de l'Internet Archive appartiennent à ceux qui les ont
déposés, les notices de la Library of Congress énoncent leurs propres droits, et
la BnF demande que la source et la date de récupération soient indiquées partout
où ses métadonnées sont montrées.

Ce MCP est un projet non officiel, sans affiliation à aucune des archives qu'il
lit.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `archive.org`, `openlibrary.org`, `www.loc.gov` et
`data.bnf.fr`, garde ses réponses en mémoire le temps qu'il tourne, et n'écrit
rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une requête emporte et
quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre les archives elles-mêmes.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-books/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les notices appartiennent aux archives qui les ont
publiées et à ceux qui les y ont déposées.
