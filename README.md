# mcp-books

One question, several archives. An MCP server that asks every archive it reads
at the same time, inside the scanned text and across the catalogues, and merges
what comes back without flattening what makes the two answers different.

Today it reads two: the **Internet Archive**, holding the machine-read text of
digitised books, periodicals and documents, and the **Library of Congress**,
holding the text of American newspaper pages and one catalogue per kind of
material.

No API key. No account. Read-only.

---

## What it does

Two archives answer different questions with the same gesture. One reads the
text inside digitised books; the other reads the text printed on newspaper
pages. Searching both for a phrase asks where that phrase was ever printed, in
books and in the press at once.

The merge is therefore **additive**. It is the places a phrase appears in each
corpus, put together. Nothing is set side by side, because two archives holding
different things have nothing to compare.

This server:

- **searches the machine-read text of every archive at once** and returns one
  list of matches, each naming the archive it came from;
- **searches every catalogue at once**, each in that archive's own vocabulary;
- **reads one record**, routed by the archive its identifier names.

### What makes the answers usable

Merging two archives is easy if you are willing to lose what tells them apart.
This one keeps every difference visible:

| The difference                                                                | What a flattened answer would do  | What happens here                                                                              |
| ----------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| One index holds a page number, the other holds none                           | Invent a page, or drop a true one | `page_number` is a real leaf on one archive and `null` on the other, and the answer says which |
| One returns the matched passage, the other the opening of the page            | Present both under one field name | `excerpt_kind` travels with every match, and the note counts how many are openings             |
| The archives count different things                                           | Add the counts into a total       | Each count is reported in that archive's own terms, and none is added to another               |
| A year means an edition's date in one place and a catalogue date in the other | Sort the merged list by year      | No date order spans the archives; a sort is applied inside each                                |
| One record states terms of reuse, another states none                         | Summarise the answer as reusable  | Terms are stated per record, and a record stating none has granted nothing                     |

### Excerpts, and what they are worth

Every excerpt is what optical recognition read off a scanned page. The words can
be wrong, so they are quoted as scanned text and the page is linked.

Beyond that, an excerpt is one of two objects, and the difference is the whole
reason the field carries a kind:

- **`passage`** is the text around the words that matched.
- **`page_opening`** is the start of the page. It arrives when the machine-read
  text that came back with a row stops before the searched words appear, so it
  does not carry the match at all. Quoting one as the archive's answer puts words
  in front of a reader that the excerpt does not hold.

Every answer counts how many of its excerpts are openings.

---

## Install

Node 20 or later.

```bash
npx -y mcp-books
```

### Claude Desktop

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

### From a clone

```bash
npm install
npm run build
node dist/index.js
```

---

## Answers take several seconds

The Library of Congress publishes a ceiling of ten requests a minute across its
whole site, and the lowest published limit governs, so this server leaves six
seconds between two of its requests. The archives are asked **at the same time**
rather than one after another, so a call costs about what the slowest archive
costs rather than the sum of them. A caller waiting on an answer is waiting on
that pacing.

---

## The three tools

### `search_inside`

A phrase in the text itself. This is the question no catalogue can answer, and
the one that justifies asking several archives at once.

| Argument                 | Type                             | Meaning                                            |
| ------------------------ | -------------------------------- | -------------------------------------------------- |
| `query`                  | string                           | Words, or a phrase in double quotes                |
| `limit`                  | integer, 1 to 25, default 3      | Matches to take from each archive                  |
| `page`                   | integer, default 1               | Which page of matches; each archive is paged apart |
| `max_excerpt_chars`      | integer, 80 to 1200, default 300 | Budget for one passage                             |
| `max_excerpts_per_match` | integer, 1 to 10, default 2      | Passages kept per match                            |
| `sources`                | array of archive ids, optional   | Left out, every archive that holds text is asked   |

A match carries `identifier`, `title`, `creator`, `year`, `excerpts`,
`excerpt_kind`, `source_url` and `page_number`. It also carries `matched_file`
and `inside_container` where a record bundles several documents, and
`published_on` and `publication` where the corpus is dated by issue.

`per_source` reports what each archive answered, what its own number counts, what
its corpus is, whether its index holds a leaf number, and what a year means on
it.

### `search_items`

The catalogue.

| Argument               | Type                                                             | Meaning                                       |
| ---------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `query`                | string                                                           | A title, a creator, a subject, or plain words |
| `media_type`           | enum, optional                                                   | The kind of material, per-archive vocabulary  |
| `year_from`, `year_to` | integer, optional                                                | In each archive's own reading of a year       |
| `sort`                 | `relevance` / `newest` / `oldest` / `title`, default `relevance` | Applied inside each archive                   |
| `limit`, `page`        | integer                                                          | Rows per archive, and which page              |
| `sources`              | array of archive ids, optional                                   | Left out, they are all asked                  |

`media_type` keeps one name across the archives and a **vocabulary per archive**.
The names are the union of what the archives use rather than a shared set: the
Internet Archive files `texts`, `movies`, `audio`, `image`, `software`, `data`
and `web`; the Library of Congress keeps a separate catalogue for `books`,
`photos`, `maps`, `audio`, `film-and-videos`, `manuscripts`, `notated-music` and
`newspapers`.

`texts` and `books` do not name the same set of things, so an archive that files
nothing under the name you give is **not asked** and is named as absent with its
own names listed. `media_types` in the answer publishes what each archive was
asked under, so a caller maps the vocabularies once and can see what was actually
searched.

Naming no kind of material leaves the Internet Archive searching every kind and
asks the Library for `books`, because it keeps one catalogue per kind and a
search has to name one. The answer says so.

### `get_item`

One record, from the archive its identifier names.

| Argument         | Type                               | Meaning                                               |
| ---------------- | ---------------------------------- | ----------------------------------------------------- |
| `identifier`     | string                             | From a search, such as `archive:<slug>` or `loc:<id>` |
| `sections`       | array, default `["description"]`   | `description`, `subjects`, `copies`, `context`        |
| `max_copies`     | integer, default 10                | Copies to list                                        |
| `text_offset`    | integer, default 0                 | Where to resume in the record's prose                 |
| `max_text_chars` | integer, 200 to 8000, default 1500 | Characters of prose to return                         |

The identifier names its archive, so the right one is read without guessing. An
address is routed by its host and its path. A shape more than one archive mints,
such as a bare run of digits, is **refused** rather than sent to a guess: a
catalogue number at the Library and an upload's slug at the Archive can be the
same string and mean different things. A string no archive would have minted is
refused too.

Terms of reuse come back on every read, whatever sections were asked for. The
answer names both what nobody asked for and what the archive files nothing under
for any record, so a null can be read correctly.

Long prose pages by character offset and resumes at a line boundary. An offset
past the end says so.

---

## What it refuses to claim

Each of these is a rule the code is held to, with a test naming it.

- **An archive that failed is named as an archive that failed, with the moment
  that failed.** A search that did not answer and a search that answered before a
  read failed are different statements about the world. An answer holding rows
  from some archives says nothing about what the others hold.
- **An archive that cannot answer a question is named as absent, with the
  reason.** Narrowing an answer to whoever was left, without saying so, leaves it
  looking like the whole of what the server reads.
- **No page number is invented, and none is dropped.** `null` on an archive whose
  index holds no leaf is the index having none, and `per_source` says which
  archives those are.
- **No excerpt is presented as something it is not.** The kind travels with every
  match and the note counts the openings.
- **No total is invented and no count is added to another.** One archive counts
  documents, another counts leaves.
- **No ranking and no date order across archives.** They share no score, and a
  year is measured on different things in each. Rows interleave, and the answer
  says how the order was built.
- **No vocabulary is translated between archives.** A name an archive does not
  use means that archive is not asked.
- **Terms of reuse are stated per record**, never summed for an answer, and
  silence is never read as permission.
- **Text from an archive cannot imitate this server.** Anything an archive or a
  caller wrote is put on a single line before it is rendered, with markdown image
  syntax defused and any opening that would pass for one of the server's own
  lines indented. The structured payload keeps the text exactly as published.

---

## Settings

All optional. A value that cannot be read is reported on stderr and the default
stands, because a server that refuses to start over a typo is very hard to
diagnose from inside a host application.

| Variable                  | Default  | Meaning                                                                                                   |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `BOOKS_USER_AGENT`        | —        | Identify your own client. The project's identifier is appended, so an archive can always reach a human    |
| `BOOKS_MIN_INTERVAL_MS`   | —        | Widens the gap between two requests to one archive. Each archive keeps its own spacing when this is unset |
| `BOOKS_TIMEOUT_MS`        | `45000`  | Deadline for one request. Generous, because reading the text of millions of pages is the slow route       |
| `BOOKS_MAX_RETRIES`       | `3`      | Retries on rate limiting and transient failures                                                           |
| `BOOKS_CACHE_TTL_MS`      | `900000` | In-memory cache lifetime. `0` turns it off                                                                |
| `BOOKS_CACHE_MAX_ENTRIES` | `200`    | In-memory cache size                                                                                      |
| `BOOKS_LOG_LEVEL`         | `error`  | `silent`, `error`, `info`, `debug`. Logs go to stderr                                                     |

Each archive is left the spacing it is owed: a second for the Internet Archive,
which publishes no ceiling for a client like this one, and six seconds for the
Library of Congress, which publishes one. `BOOKS_MIN_INTERVAL_MS` can widen both
and can narrow neither, whichever way the setting arrives.

---

## As a library

The layer that talks to the archives is published beside the server, with no
protocol attached.

```ts
import { BooksClient } from "mcp-books/client";

const client = new BooksClient();
const merged = await client.searchInside("a wet fog", {
  limit: 3,
  page: 1,
  maxExcerptChars: 300,
  maxExcerptsPerMatch: 2,
});

for (const report of merged.reports) {
  console.log(report.name, report.status, report.reportedTotalMeans ?? "");
}
```

`BooksClient` also takes stand-in readers, so a program embedding it can put its
own cache in front of an archive, or drive it from fixed answers in a test:

```ts
new BooksClient({ readers: { archive: myReader } });
```

A program bringing archives of its own replaces the registry outright with
`sources`, and every tool works over however many it holds, including archives
that answer only some of the three calls.

---

## When something goes wrong

Six error codes, and no others.

| Code            | Means                                                |
| --------------- | ---------------------------------------------------- |
| `not_found`     | An archive answered, and holds no such record        |
| `invalid_input` | The arguments could not produce a request            |
| `rate_limited`  | An archive asked this client to slow down            |
| `parse_failure` | An answer arrived in a shape this client cannot read |
| `network_error` | The request did not complete                         |
| `timeout`       | The request exceeded its deadline                    |

`rate_limited` means the record may well exist. Wait and ask again.

A `parse_failure` usually means an archive changed how it answers. That is worth
reporting: <https://github.com/smeet666/mcp-books/issues>

If a search comes back short, read `per_source` before concluding anything.

---

## Development

```bash
npm install
npm run typecheck
npm test           # unit tests, no network
npm run build
```

The unit suite runs against stand-in archives, so it is deterministic: time is
pinned to a fixed epoch, and every assertion is exact. A live suite sits behind
an environment variable and makes one request per route:

```bash
BOOKS_LIVE=1 npm run test:live
```

A nightly job runs that suite against the real archives and opens an issue when
it fails, because the unit tests cannot notice that an archive changed.

**Adding an archive.** Write an adapter: what it is called, which identifiers it
mints, which of the three calls it can answer, how to make them, and what its own
numbers count. Register it in `src/sources/registry.ts`. An adapter that declares
it cannot answer one of the calls is named as absent from that tool, and the
server's own guidance is generated from the registry, so it describes what the
server actually reads.

**Dependencies.** The reading of each archive is a published library this server
depends on rather than code it carries. Each keeps its own pacing, its own cache
and its own error taxonomy, so a fix to how a page is parsed reaches here as a
version bump. Everything above that seam, including the whole of the merge, lives
in this repository.

---

## Licence and credit

This server is MIT. What it returns is not.

Both archives set terms per deposit, and most records state none at all. A record
stating no terms has granted nothing: it is not a licence, and it is not a
refusal either. Read the record with `get_item`, check the archive's own page, and
credit what you use.

Every result carries a `source_url`. Use it.

---

---

# mcp-books (français)

Une question, plusieurs archives. Un serveur MCP qui interroge en même temps
toutes les archives qu'il lit, dans le texte numérisé comme dans les catalogues,
et fusionne leurs réponses sans aplatir ce qui les distingue.

Il en lit deux aujourd'hui : l'**Internet Archive**, qui détient le texte lu par
reconnaissance optique sur des livres, des périodiques et des documents
numérisés, et la **Library of Congress**, qui détient le texte des pages de
journaux américains et un catalogue par nature de document.

Aucune clé d'API. Aucun compte. Lecture seule.

---

## Ce qu'il fait

Deux archives répondent à des questions différentes par le même geste. L'une lit
le texte à l'intérieur des livres numérisés, l'autre celui imprimé sur les pages
de journaux. Chercher une phrase dans les deux, c'est demander où cette phrase a
été imprimée, dans les livres et dans la presse à la fois.

La fusion est donc **additive** : ce sont les endroits où la phrase apparaît dans
chaque corpus, réunis. Rien n'est mis côte à côte, car deux archives qui
détiennent des choses différentes n'ont rien à comparer.

Ce serveur :

- **cherche dans le texte numérisé de toutes les archives à la fois** et renvoie
  une seule liste de correspondances, chacune nommant l'archive d'où elle vient ;
- **cherche dans tous les catalogues à la fois**, chacun dans le vocabulaire qui
  lui est propre ;
- **lit une notice**, routée vers l'archive que son identifiant nomme.

### Ce qui rend les réponses utilisables

Fusionner deux archives est facile si l'on accepte de perdre ce qui les
distingue. Ici, chaque écart reste visible :

| L'écart                                                            | Ce que ferait une réponse aplatie            | Ce qui se passe ici                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Un index porte un numéro de page, l'autre non                      | Inventer une page, ou en supprimer une vraie | `page_number` est une vraie feuille chez l'une et `null` chez l'autre, et la réponse dit laquelle |
| L'une rend le passage qui correspond, l'autre le début de la page  | Les présenter sous un seul nom de champ      | `excerpt_kind` voyage avec chaque correspondance, et la note compte les débuts de page            |
| Les archives comptent des choses différentes                       | Additionner les compteurs                    | Chaque compteur est rapporté dans les termes de son archive, et aucun n'est ajouté à un autre     |
| Une année vaut la date d'une édition ici, une date de catalogue là | Trier la liste fusionnée par année           | Aucun ordre par date ne traverse les archives ; le tri s'applique à l'intérieur de chacune        |
| Une notice énonce des conditions, une autre n'en énonce aucune     | Résumer la réponse comme réutilisable        | Les droits se disent par notice, et une notice qui n'énonce rien n'a rien accordé                 |

### Les extraits, et ce qu'ils valent

Chaque extrait est ce qu'une reconnaissance optique a lu sur une page numérisée.
Les mots peuvent être faux : on les cite comme du texte scanné, et on lie la page.

Au-delà, un extrait est l'un de deux objets, et c'est toute la raison d'être du
champ qui en porte la nature :

- **`passage`** : le texte autour des mots qui ont correspondu.
- **`page_opening`** : le début de la page. Il arrive quand le texte numérisé
  renvoyé avec la ligne s'arrête avant les mots cherchés : il ne porte donc pas
  la correspondance. Le citer comme la réponse de l'archive met sous les yeux
  d'un lecteur des mots que l'extrait ne contient pas.

Chaque réponse dit combien de ses extraits sont des débuts de page.

---

## Installation

Node 20 ou plus récent.

```bash
npx -y mcp-books
```

### Claude Desktop

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

---

## Une réponse prend plusieurs secondes

La Library of Congress annonce un plafond de dix requêtes par minute pour
l'ensemble de son site, et c'est la limite la plus basse qui gouverne : ce
serveur laisse donc six secondes entre deux de ses requêtes. Les archives sont
interrogées **en même temps** plutôt que l'une après l'autre, si bien qu'un appel
coûte à peu près ce que coûte l'archive la plus lente, et non la somme des deux.
Un appelant qui attend une réponse attend ce rythme.

---

## Les trois outils

### `search_inside`

Une phrase dans le texte lui-même. C'est la question à laquelle aucun catalogue
ne répond, et celle qui justifie d'interroger plusieurs archives à la fois.

| Argument                 | Type                              | Sens                                                           |
| ------------------------ | --------------------------------- | -------------------------------------------------------------- |
| `query`                  | string                            | Des mots, ou une phrase entre guillemets doubles               |
| `limit`                  | entier, 1 à 25, défaut 3          | Correspondances prises à chaque archive                        |
| `page`                   | entier, défaut 1                  | Quelle page ; chaque archive est paginée séparément            |
| `max_excerpt_chars`      | entier, 80 à 1200, défaut 300     | Budget d'un passage                                            |
| `max_excerpts_per_match` | entier, 1 à 10, défaut 2          | Passages gardés par correspondance                             |
| `sources`                | tableau d'identifiants, optionnel | Absent, toutes celles qui détiennent du texte sont interrogées |

`per_source` rapporte ce qu'a répondu chaque archive, ce que compte son propre
nombre, quel est son corpus, si son index porte un numéro de feuille, et ce que
vaut une année chez elle.

### `search_items`

Le catalogue.

| Argument               | Type                                                            | Sens                                            |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `query`                | string                                                          | Un titre, un auteur, un sujet, ou des mots      |
| `media_type`           | enum, optionnel                                                 | La nature du document, vocabulaire par archive  |
| `year_from`, `year_to` | entier, optionnel                                               | Dans la lecture qu'a chaque archive d'une année |
| `sort`                 | `relevance` / `newest` / `oldest` / `title`, défaut `relevance` | Appliqué à l'intérieur de chaque archive        |
| `limit`, `page`        | entier                                                          | Lignes par archive, et quelle page              |
| `sources`              | tableau d'identifiants, optionnel                               | Absent, toutes sont interrogées                 |

`media_type` garde un seul nom d'argument et un **vocabulaire par archive**. Les
valeurs sont l'union de ce qu'emploient les archives, non un ensemble commun :
l'Internet Archive classe sous `texts`, `movies`, `audio`, `image`, `software`,
`data`, `web` ; la Library of Congress tient un catalogue distinct pour `books`,
`photos`, `maps`, `audio`, `film-and-videos`, `manuscripts`, `notated-music`,
`newspapers`.

`texts` et `books` ne désignent pas le même ensemble : une archive qui ne classe
rien sous le nom donné n'est **pas interrogée**, et elle est nommée comme absente
avec ses propres noms. `media_types` publie sous quel nom chaque archive a été
interrogée, pour qu'un appelant fasse la correspondance une fois et voie ce qui a
réellement été cherché.

Ne nommer aucune nature laisse l'Internet Archive chercher dans tout et demande
`books` à la Library, qui tient un catalogue par nature et exige donc qu'on en
nomme un. La réponse le dit.

### `get_item`

Une notice, chez l'archive que son identifiant nomme.

| Argument         | Type                              | Sens                                                 |
| ---------------- | --------------------------------- | ---------------------------------------------------- |
| `identifier`     | string                            | Issu d'une recherche, `archive:<slug>` ou `loc:<id>` |
| `sections`       | tableau, défaut `["description"]` | `description`, `subjects`, `copies`, `context`       |
| `max_copies`     | entier, défaut 10                 | Exemplaires listés                                   |
| `text_offset`    | entier, défaut 0                  | Où reprendre dans la prose de la notice              |
| `max_text_chars` | entier, 200 à 8000, défaut 1500   | Caractères de prose renvoyés                         |

L'identifiant nomme son archive, donc la bonne est lue sans deviner. Une adresse
est routée par son hôte et son chemin. Une forme que plusieurs archives
produisent, comme une suite de chiffres nue, est **refusée** plutôt qu'envoyée à
un pari : un numéro de catalogue à la Library et un identifiant de dépôt à
l'Archive peuvent être la même chaîne et désigner deux choses. Une chaîne
qu'aucune archive n'aurait produite est refusée aussi.

Les conditions de réutilisation reviennent à chaque lecture, quelles que soient
les sections demandées. La réponse nomme à la fois ce que personne n'a demandé et
ce que l'archive ne renseigne jamais, pour qu'un `null` se lise correctement.

---

## Ce qu'il refuse d'affirmer

Chacune de ces règles est tenue par un test qui la nomme.

- **Une archive en échec est nommée comme telle, avec le moment qui a échoué.**
  Une recherche qui n'a pas répondu et une recherche qui a répondu avant qu'une
  lecture échoue sont deux affirmations différentes sur le monde.
- **Une archive qui ne sait pas répondre est nommée comme absente, avec la
  raison.** Restreindre une réponse à qui restait, sans le dire, la laisse
  ressembler à tout ce que le serveur lit.
- **Aucun numéro de page n'est inventé, et aucun n'est supprimé.** Un `null` chez
  une archive dont l'index n'en porte pas, c'est l'index qui n'en a pas, et
  `per_source` dit lesquelles sont dans ce cas.
- **Aucun extrait n'est présenté pour autre chose que ce qu'il est.** Sa nature
  voyage avec chaque correspondance, et la note compte les débuts de page.
- **Aucun total n'est inventé et aucun compteur n'est ajouté à un autre.** L'une
  compte des documents, l'autre des feuilles.
- **Aucun classement et aucun ordre par date entre archives.** Elles ne partagent
  aucun score, et une année ne se mesure pas sur la même chose. Les lignes
  alternent, et la réponse dit comment l'ordre a été construit.
- **Aucun vocabulaire n'est traduit d'une archive à l'autre.**
- **Les droits se disent par notice**, jamais résumés pour la réponse entière, et
  le silence n'est jamais lu comme une autorisation.
- **Le texte d'une archive ne peut pas imiter ce serveur.** Tout ce qu'une archive
  ou un appelant a écrit tient sur une seule ligne avant affichage, la syntaxe
  d'image markdown est désamorcée, et une ouverture qui passerait pour une ligne
  du serveur est indentée. La charge structurée conserve le texte tel que publié.

---

## Réglages

Tous optionnels. Une valeur illisible est signalée sur stderr et la valeur par
défaut s'applique : un serveur qui refuse de démarrer à cause d'une faute de
frappe est très difficile à diagnostiquer depuis l'application hôte.

| Variable                  | Défaut   | Sens                                                                                                    |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `BOOKS_USER_AGENT`        | —        | Identifiez votre client. L'identité du projet est ajoutée, pour qu'une archive puisse joindre un humain |
| `BOOKS_MIN_INTERVAL_MS`   | —        | Élargit l'écart entre deux requêtes vers une archive. Absent, chaque archive garde son propre rythme    |
| `BOOKS_TIMEOUT_MS`        | `45000`  | Délai maximal d'une requête. Large, car lire le texte de millions de pages est la route lente           |
| `BOOKS_MAX_RETRIES`       | `3`      | Réessais en cas de limitation ou d'échec passager                                                       |
| `BOOKS_CACHE_TTL_MS`      | `900000` | Durée de vie du cache mémoire. `0` le désactive                                                         |
| `BOOKS_CACHE_MAX_ENTRIES` | `200`    | Taille du cache mémoire                                                                                 |
| `BOOKS_LOG_LEVEL`         | `error`  | `silent`, `error`, `info`, `debug`. Sur stderr                                                          |

Chaque archive reçoit le rythme qui lui est dû : une seconde pour l'Internet
Archive, qui ne publie aucun plafond pour un client comme celui-ci, et six
secondes pour la Library of Congress, qui en publie un.
`BOOKS_MIN_INTERVAL_MS` peut élargir les deux et n'en resserre aucun, par quelque
chemin que le réglage arrive.

---

## En cas de problème

Six codes d'erreur, et pas d'autres.

| Code            | Sens                                                            |
| --------------- | --------------------------------------------------------------- |
| `not_found`     | Une archive a répondu, et n'a pas cette notice                  |
| `invalid_input` | Les arguments ne permettaient pas de former une requête         |
| `rate_limited`  | Une archive a demandé à ce client de ralentir                   |
| `parse_failure` | Une réponse est arrivée dans une forme illisible pour ce client |
| `network_error` | La requête n'a pas abouti                                       |
| `timeout`       | La requête a dépassé son délai                                  |

`rate_limited` laisse entière la possibilité que la notice existe. Attendez et
redemandez.

Un `parse_failure` signifie en général qu'une archive a changé sa façon de
répondre. Cela vaut un signalement :
<https://github.com/smeet666/mcp-books/issues>

Si une recherche revient courte, lisez `per_source` avant d'en conclure quoi que
ce soit.

---

## Licence et crédit

Ce serveur est sous licence MIT. Ce qu'il renvoie ne l'est pas.

Les deux archives fixent leurs conditions dépôt par dépôt, et la plupart des
notices n'en énoncent aucune. Une notice qui n'énonce rien n'a rien accordé : ce
n'est pas une licence, et ce n'est pas non plus un refus. Lisez la notice avec
`get_item`, vérifiez la page de l'archive, et créditez ce que vous reprenez.

Chaque résultat porte un `source_url`. Servez-vous-en.
