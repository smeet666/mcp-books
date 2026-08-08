# mcp-books

One question, several archives. An MCP server that asks every archive it reads
at the same time, inside the scanned text and across the catalogues, and merges
what comes back without flattening what makes the two answers different.

Today it reads three: the **Internet Archive**, holding the machine-read text of
digitised books, periodicals and documents; the **Library of Congress**, holding
the text of American newspaper pages and one catalogue per kind of material; and
**data.bnf.fr**, the open catalogue of the Bibliothèque nationale de France,
which describes works as entities and holds no text of its own.

No API key. No account. Read-only.

---

## What it does

These archives answer different questions with the same gesture. One reads the
text inside digitised books; another reads the text printed on newspaper pages;
another describes works a national library has catalogued, and carries no text
at all. Searching for a phrase asks where that phrase was ever printed, in books
and in the press at once, and the archive that holds no text is named as absent
from that question rather than quietly left out.

The merge is therefore **additive**. It is what each archive holds, put
together. Nothing is set side by side, because archives holding different things
have nothing to compare.

This server:

- **searches the machine-read text of every archive at once** and returns one
  list of matches, each naming the archive it came from;
- **searches every catalogue at once**, each in that archive's own vocabulary;
- **reads one record**, routed by the archive its identifier names.

### What makes the answers usable

Merging two archives is easy if you are willing to lose what tells them apart.
This one keeps every difference visible:

| The difference                                                                | What a flattened answer would do  | What happens here                                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| One index holds a page number, the other holds none                           | Invent a page, or drop a true one | `page_number` is a real leaf on one archive and `null` on the other, and the answer says which                                                  |
| One returns the matched passage, the other the opening of the page            | Present both under one field name | `excerpt_kind` travels with every match, the note counts how many are openings, and an opening is placed after the matches that carry the words |
| The archives count different things                                           | Add the counts into a total       | Each count is reported in that archive's own terms, and none is added to another                                                                |
| A year means an edition's date in one place and a catalogue date in the other | Sort the merged list by year      | No date order spans the archives; a sort is applied inside each, and what that order can and cannot express is said                             |
| One record states terms of reuse, another states none                         | Summarise the answer as reusable  | Terms are stated per record, and a record stating none has granted nothing                                                                      |
| One archive searches a whole record, another searches titles alone            | Present one query as one question | `searches_on` says which fields each archive read, and the notes say the same words were not the same question                                  |
| One archive applies a year range and an order, another applies neither        | Report the filter as applied      | A narrowing an archive cannot apply is never sent to it, and `filters_dropped` names the archive and the reason                                 |
| One row is a copy held somewhere, another is a work as an entity              | Call them all the same thing      | `row_describes` says what a row is on each archive, and `identifier_provisional` marks an identifier its archive can still replace              |

### One query, several questions

The archives do not read the same fields. An index over a whole record answers a
person's name with the books that person wrote; an index over titles alone
answers the same name with the books written **about** them. Sending one query to
several archives therefore asks several questions, and the answer says which:
`searches_on` in `per_source` names the fields each archive matched against, and
a note says so in the block a text-only client renders.

The narrowings work the same way. `year_from`, `year_to` and `sort` are applied
by the archives whose catalogues carry them. An archive whose catalogue carries
neither is **never sent them**, and `filters_dropped` names it with the reason,
because a merged list that honoured a criterion on two of its halves and dropped
it in silence on the third would claim a filter one of its halves never received.
A row from such an archive that happens to satisfy the range does so by chance.

A row is not one kind of thing either. It is a copy an archive holds on one, a
catalogue record that may name something on a shelf on another, and a work as an
entity on a third, whose editions and whose author are records of their own.
`row_describes` says which, `media_type` carries each archive's own word for it,
and `identifier_provisional` marks a row whose identifier the archive itself
calls provisional and can replace once a cataloguer settles the record.

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

Matches whose excerpt carries the searched words are also placed **before** the
matches whose excerpt does not. Whether an excerpt holds those words is a
property each row states about itself, so ordering on it compares no score
across archives and invents no relevance. Nothing is dropped for it: a page
opening still names a page where the words were found, and it stays in the
answer behind the matches that show them. The one-from-each-archive order holds
inside each of the two groups. An answer whose matches are all of one kind was
placed by nothing, and keeps quiet about an order it did not perform.

### One question, several wordings

The indexes behind these archives are conjunctive: every word given has to
appear in the same document. A question written as a sentence therefore comes
back empty on a work the archives hold several copies of, and that emptiness
reads as an archive holding nothing.

Both searches answer it by deriving further wordings from the query and asking
each archive for the **union** of what they return. The derivations are made
from the words themselves, with no corpus statistics and no language model, so
every wording sent is one a reader can retype:

- the words as asked, always first;
- a quoted phrase without its quotation marks, which an index requiring those
  words adjacent can then match apart;
- the leading words of a long question, because every word given has to appear
  and the words naming the thing are written before the words framing it;
- the same words with their diacritics removed, and two words run together,
  because a name is filed under more than one spelling.

Two derivations are deliberately not made. A run-together word is never split
into two, and diacritics are never added to a word written without them: where
the cut falls and which letter takes an accent are facts about a language, and
guessing at either would send an archive a word nobody wrote.

What it costs is bounded. Each archive is asked at most **three** queries, one
after another so its own pacing is kept, and it is asked a derived wording only
when the words as asked returned fewer rows than `limit`. A query that works
therefore costs exactly one request per archive. Beyond the first page, and with
`fan_out` set to false, the words as asked are sent and nothing else.

Nothing about this is implicit. `queries_run` counts the requests that went out,
and `queries` in `per_source` holds every wording with what it returned, why any
was withheld, and any that failed. A wording that returned nothing is kept there,
because that is a statement about the wording rather than about the corpus. The
union is deduplicated on the namespaced identifier, so two archives returning the
same string stay two records, and the rows follow the order the wordings were
sent: this server's own order over what it received, never an archive's
judgement of relevance.

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

Each archive is left the spacing it is owed: one second for the Internet
Archive, which publishes no ceiling for a client like this one; six seconds for
the Library of Congress, which publishes a ceiling of ten requests a minute
across its whole site, the lowest published limit governing; and three seconds
for data.bnf.fr, which states no rate for its catalogue and publishes a crawl
delay of five seconds for its digitisation site.

The archives are asked **at the same time** rather than one after another, so a
call costs about what the slowest archive costs rather than the sum of them. A
caller waiting on an answer is waiting on that pacing.

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
| `fan_out`                | boolean, default true            | Derive further wordings and ask for their union    |
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

| Argument               | Type                                                             | Meaning                                                                                    |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `query`                | string                                                           | A title, a creator, a subject, or plain words                                              |
| `media_type`           | enum, optional                                                   | The kind of material, per-archive vocabulary                                               |
| `year_from`, `year_to` | integer, optional                                                | In each archive's own reading of a year                                                    |
| `sort`                 | `relevance` / `newest` / `oldest` / `title`, default `relevance` | Applied inside each archive; a date order is qualified rather than presented as chronology |
| `limit`, `page`        | integer                                                          | Rows per archive, and which page                                                           |
| `fan_out`              | boolean, default true                                            | Derive further wordings and ask for their union                                            |
| `sources`              | array of archive ids, optional                                   | Left out, they are all asked                                                               |

`media_type` keeps one name across the archives and a **vocabulary per archive**.
The names are the union of what the archives use rather than a shared set: the
Internet Archive files `texts`, `movies`, `audio`, `image`, `software`, `data`
and `web`; the Library of Congress keeps a separate catalogue for `books`,
`photos`, `maps`, `audio`, `film-and-videos`, `manuscripts`, `notated-music` and
`newspapers`; data.bnf.fr files `work`, which names an entity rather than a
holding.

`texts` and `books` do not name the same set of things, so an archive that files
nothing under the name you give is **not asked** and is named as absent with its
own names listed. `media_types` in the answer publishes what each archive was
asked under, so a caller maps the vocabularies once and can see what was actually
searched.

Naming no kind of material leaves the Internet Archive searching every kind and
asks the Library for `books`, because it keeps one catalogue per kind and a
search has to name one. The answer says so.

`per_source` also carries `searches_on`, `row_describes` and `filters_dropped`,
which are what a caller reads before comparing two rows or trusting a filter.

### `get_item`

One record, from the archive its identifier names.

| Argument         | Type                               | Meaning                                                            |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `identifier`     | string                             | From a search, such as `archive:<slug>`, `loc:<id>` or `bnf:<ark>` |
| `sections`       | array, default `["description"]`   | `description`, `subjects`, `copies`, `context`                     |
| `max_copies`     | integer, default 10                | Copies to list                                                     |
| `text_offset`    | integer, default 0                 | Where to resume in the record's prose                              |
| `max_text_chars` | integer, 200 to 8000, default 1500 | Characters of prose to return                                      |

The identifier names its archive, so the right one is read without guessing. An
address is routed by its host and its path. A shape more than one archive mints,
such as a bare run of digits, is **refused** rather than sent to a guess: a
catalogue number at the Library and an upload's slug at the Archive can be the
same string and mean different things. A string no archive would have minted is
refused too.

Terms of reuse come back on every read, whatever sections were asked for. The
answer names both what nobody asked for and what the archive files nothing under
for any record, so a null can be read correctly. An archive publishing its whole
catalogue on one condition says so as a condition over the catalogue, and its
credit line carries what that condition asks for.

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
  match, the note counts the openings, and a match whose excerpt carries the
  searched words is placed ahead of one whose excerpt carries them nowhere. That
  order runs on what each row states about itself, and no match is dropped for it.
- **No total is invented and no count is added to another.** One archive counts
  documents, another counts leaves.
- **No ranking and no date order across archives.** They share no score, and a
  year is measured on different things in each. Rows interleave, and the answer
  says how the order was built.
- **A date order is never presented as chronology.** `oldest` and `newest` run
  inside each archive on a date field carrying a year and no era, so a date
  before the common era is filed there as a year of this one and a clay tablet
  can land among the 1600s. A record stating no date is placed by a stand-in
  rather than by its age. The answer says both, and counts the rows in front of
  the reader that carry no year, so the caveat is measured on the question that
  was actually asked.
- **No vocabulary is translated between archives.** A name an archive does not
  use means that archive is not asked.
- **No filter is reported as applied where it was never sent.** An archive whose
  catalogue carries no year range and no order is not sent them, and the answer
  names it with the reason.
- **One query is not presented as one question.** The archives match against
  different fields, and the answer publishes which fields each of them read.
- **A row is never described as something it is not.** A work as an entity is
  not a copy of an edition, and an identifier its archive calls provisional is
  marked as one that can change.
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
which publishes no ceiling for a client like this one, six seconds for the
Library of Congress, which publishes one, and three seconds for data.bnf.fr.
`BOOKS_MIN_INTERVAL_MS` can widen every one of them and can narrow none,
whichever way the setting arrives.

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

The archives of scans set terms per deposit, and most of their records state none
at all. A record stating no terms has granted nothing: it is not a licence, and
it is not a refusal either. Read the record with `get_item`, check the archive's
own page, and credit what you use.

data.bnf.fr publishes its metadata on one condition: name the source and state
the date the metadata was retrieved. Every answer carrying one of its rows
carries that credit with the date, in `attribution` and in the credit line at the
foot of the text block. Repeat both.

Its records can point at a digitised document on Gallica. Those are addresses for
a person to open. This server never requests them, because the library places its
metadata and its digitised contents under two different regimes, so it can say a
document exists at an address and nothing at all about what is there.

Every result carries a `source_url`. Use it.

---

---

# mcp-books (français)

Une question, plusieurs archives. Un serveur MCP qui interroge en même temps
toutes les archives qu'il lit, dans le texte numérisé comme dans les catalogues,
et fusionne leurs réponses sans aplatir ce qui les distingue.

Il en lit trois aujourd'hui : l'**Internet Archive**, qui détient le texte lu par
reconnaissance optique sur des livres, des périodiques et des documents
numérisés ; la **Library of Congress**, qui détient le texte des pages de
journaux américains et un catalogue par nature de document ; et **data.bnf.fr**,
le catalogue ouvert de la Bibliothèque nationale de France, qui décrit des œuvres
comme des entités et ne détient aucun texte.

Aucune clé d'API. Aucun compte. Lecture seule.

---

## Ce qu'il fait

Ces archives répondent à des questions différentes par le même geste. L'une lit
le texte à l'intérieur des livres numérisés, une autre celui imprimé sur les
pages de journaux, une autre décrit les œuvres qu'une bibliothèque nationale a
cataloguées et ne détient aucun texte. Chercher une phrase, c'est demander où
elle a été imprimée, dans les livres et dans la presse à la fois ; l'archive qui
ne détient aucun texte est nommée comme absente de cette question plutôt que
retirée en silence.

La fusion est donc **additive** : c'est ce que détient chaque archive, réuni.
Rien n'est mis côte à côte, car des archives qui détiennent des choses
différentes n'ont rien à comparer.

Ce serveur :

- **cherche dans le texte numérisé de toutes les archives à la fois** et renvoie
  une seule liste de correspondances, chacune nommant l'archive d'où elle vient ;
- **cherche dans tous les catalogues à la fois**, chacun dans le vocabulaire qui
  lui est propre ;
- **lit une notice**, routée vers l'archive que son identifiant nomme.

### Ce qui rend les réponses utilisables

Fusionner des archives est facile si l'on accepte de perdre ce qui les distingue.
Ici, chaque écart reste visible :

| L'écart                                                            | Ce que ferait une réponse aplatie            | Ce qui se passe ici                                                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un index porte un numéro de page, l'autre non                      | Inventer une page, ou en supprimer une vraie | `page_number` est une vraie feuille chez l'une et `null` chez l'autre, et la réponse dit laquelle                                                                 |
| L'une rend le passage qui correspond, l'autre le début de la page  | Les présenter sous un seul nom de champ      | `excerpt_kind` voyage avec chaque correspondance, la note compte les débuts de page, et un début de page est placé après les correspondances qui portent les mots |
| Les archives comptent des choses différentes                       | Additionner les compteurs                    | Chaque compteur est rapporté dans les termes de son archive, et aucun n'est ajouté à un autre                                                                     |
| Une année vaut la date d'une édition ici, une date de catalogue là | Trier la liste fusionnée par année           | Aucun ordre par date ne traverse les archives ; le tri s'applique à l'intérieur de chacune, et la réponse dit ce que cet ordre peut et ne peut pas exprimer       |
| Une notice énonce des conditions, une autre n'en énonce aucune     | Résumer la réponse comme réutilisable        | Les droits se disent par notice, et une notice qui n'énonce rien n'a rien accordé                                                                                 |
| L'une cherche dans toute la notice, l'autre dans les seuls titres  | Présenter une requête comme une question     | `searches_on` dit sur quels champs chaque archive a cherché, et les notes disent que les mêmes mots n'étaient pas la même question                                |
| L'une applique un intervalle d'années et un tri, l'autre aucun     | Rapporter le filtre comme appliqué           | Un filtre qu'une archive ne sait pas appliquer ne lui est jamais envoyé, et `filters_dropped` nomme l'archive et la raison                                        |
| Une ligne est un exemplaire détenu, une autre une œuvre-entité     | Les appeler toutes la même chose             | `row_describes` dit ce qu'est une ligne chez chaque archive, et `identifier_provisional` signale un identifiant que l'archive peut encore remplacer               |

### Une requête, plusieurs questions

Les archives ne lisent pas les mêmes champs. Un index sur toute la notice répond
au nom d'une personne par les livres qu'elle a écrits ; un index sur les seuls
titres répond au même nom par les livres écrits **sur** elle. Envoyer une requête
à plusieurs archives pose donc plusieurs questions, et la réponse dit lesquelles :
`searches_on` dans `per_source` nomme les champs sur lesquels chaque archive a
cherché, et une note le dit dans le bloc que rend un client textuel.

Les filtres suivent la même règle. `year_from`, `year_to` et `sort` sont
appliqués par les archives dont le catalogue les porte. Une archive dont le
catalogue n'en porte aucun ne les reçoit **jamais**, et `filters_dropped` la
nomme avec la raison : une liste fusionnée qui honorerait un critère sur deux de
ses moitiés et l'abandonnerait en silence sur la troisième affirmerait un filtre
que l'une de ses moitiés n'a jamais reçu. Une ligne d'une telle archive qui
satisfait l'intervalle le fait par hasard.

Une ligne n'est pas non plus une seule sorte de chose. C'est un exemplaire
détenu par l'archive chez l'une, une notice de catalogue qui peut désigner
quelque chose posé sur une étagère chez une autre, et une œuvre comme entité chez
une troisième, dont les éditions et l'auteur sont des notices à part entière.
`row_describes` dit laquelle, `media_type` porte le mot propre à chaque archive,
et `identifier_provisional` signale une ligne dont l'archive elle-même qualifie
l'identifiant de provisoire et peut le remplacer une fois la notice établie.

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

Les correspondances dont l'extrait porte les mots cherchés sont en outre placées
**avant** celles dont l'extrait ne les porte pas. Qu'un extrait contienne ou non
ces mots est une propriété que chaque ligne énonce d'elle-même : ordonner
là-dessus ne compare aucun score entre archives et n'invente aucune pertinence.
Rien n'est supprimé pour autant : un début de page nomme quand même une page où
les mots ont été trouvés, et il reste dans la réponse derrière les
correspondances qui les montrent. L'alternance entre archives tient à
l'intérieur de chacun des deux groupes. Une réponse dont toutes les
correspondances sont de même nature n'a été placée par rien, et se tait sur un
ordre qu'elle n'a pas effectué.

### Une question, plusieurs formulations

Les index derrière ces archives sont conjonctifs : chaque mot donné doit
apparaître dans le même document. Une question écrite comme une phrase revient
donc vide sur une œuvre dont les archives détiennent plusieurs exemplaires, et ce
vide se lit comme une archive qui ne détient rien.

Les deux recherches y répondent en dérivant d'autres formulations de la requête
et en demandant à chaque archive l'**union** de ce qu'elles rendent. Les
dérivations se font à partir des mots eux-mêmes, sans statistiques de corpus ni
modèle de langue : chaque formulation envoyée est donc une formulation qu'un
lecteur peut retaper.

- les mots tels quels, toujours en premier ;
- une phrase entre guillemets sans ses guillemets, qu'un index exigeant ces mots
  contigus peut alors trouver séparés ;
- les premiers mots d'une longue question, puisque chaque mot donné doit
  apparaître et que les mots qui nomment la chose précèdent ceux qui posent la
  question ;
- les mêmes mots sans leurs diacritiques, et deux mots accolés, parce qu'un nom
  est classé sous plusieurs graphies.

Deux dérivations sont délibérément écartées. Un mot accolé n'est jamais coupé en
deux, et aucun diacritique n'est ajouté à un mot écrit sans : l'endroit de la
coupe et la lettre qui prend l'accent relèvent d'une langue, et les deviner
enverrait à une archive un mot que personne n'a écrit.

Le coût est borné. Chaque archive reçoit au plus **trois** requêtes, l'une après
l'autre pour que sa cadence soit tenue, et elle ne reçoit une formulation dérivée
que si les mots tels quels ont rendu moins de lignes que `limit`. Une requête qui
fonctionne coûte donc exactement une requête par archive. Au-delà de la première
page, et avec `fan_out` à faux, seuls les mots tels quels sont envoyés.

Rien n'est implicite. `queries_run` compte les requêtes réellement parties, et
`queries` dans `per_source` porte chaque formulation avec ce qu'elle a rendu,
pourquoi l'une a été retenue, et laquelle a échoué. Une formulation qui n'a rien
rendu y reste, parce que c'est une information sur cette formulation et non sur
le corpus. L'union est dédupliquée sur l'identifiant préfixé par l'archive : deux
archives rendant la même chaîne restent deux notices, et les lignes suivent
l'ordre d'envoi des formulations, qui est l'ordre de ce serveur sur ce qu'il a
reçu et jamais un jugement de pertinence d'une archive.

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

Chaque archive reçoit le rythme qui lui est dû : une seconde pour l'Internet
Archive, qui ne publie aucun plafond pour un client comme celui-ci ; six secondes
pour la Library of Congress, qui annonce dix requêtes par minute pour l'ensemble
de son site et dont c'est la limite la plus basse qui gouverne ; et trois
secondes pour data.bnf.fr, qui n'annonce aucun rythme pour son catalogue et
publie un délai de cinq secondes pour son site de numérisation.

Les archives sont interrogées **en même temps** plutôt que l'une après l'autre,
si bien qu'un appel coûte à peu près ce que coûte l'archive la plus lente, et non
la somme de toutes. Un appelant qui attend une réponse attend ce rythme.

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
| `fan_out`                | booléen, défaut vrai              | Dériver d'autres formulations et demander leur union           |
| `sources`                | tableau d'identifiants, optionnel | Absent, toutes celles qui détiennent du texte sont interrogées |

`per_source` rapporte ce qu'a répondu chaque archive, ce que compte son propre
nombre, quel est son corpus, si son index porte un numéro de feuille, et ce que
vaut une année chez elle.

### `search_items`

Le catalogue.

| Argument               | Type                                                            | Sens                                                                                                              |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `query`                | string                                                          | Un titre, un auteur, un sujet, ou des mots                                                                        |
| `media_type`           | enum, optionnel                                                 | La nature du document, vocabulaire par archive                                                                    |
| `year_from`, `year_to` | entier, optionnel                                               | Dans la lecture qu'a chaque archive d'une année                                                                   |
| `sort`                 | `relevance` / `newest` / `oldest` / `title`, défaut `relevance` | Appliqué à l'intérieur de chaque archive ; un tri par date est qualifié plutôt que présenté comme une chronologie |
| `limit`, `page`        | entier                                                          | Lignes par archive, et quelle page                                                                                |
| `fan_out`              | booléen, défaut vrai                                            | Dériver d'autres formulations et demander leur union                                                              |
| `sources`              | tableau d'identifiants, optionnel                               | Absent, toutes sont interrogées                                                                                   |

`media_type` garde un seul nom d'argument et un **vocabulaire par archive**. Les
valeurs sont l'union de ce qu'emploient les archives, non un ensemble commun :
l'Internet Archive classe sous `texts`, `movies`, `audio`, `image`, `software`,
`data`, `web` ; la Library of Congress tient un catalogue distinct pour `books`,
`photos`, `maps`, `audio`, `film-and-videos`, `manuscripts`, `notated-music`,
`newspapers` ; data.bnf.fr classe sous `work`, qui nomme une entité et non un
exemplaire.

`texts` et `books` ne désignent pas le même ensemble : une archive qui ne classe
rien sous le nom donné n'est **pas interrogée**, et elle est nommée comme absente
avec ses propres noms. `media_types` publie sous quel nom chaque archive a été
interrogée, pour qu'un appelant fasse la correspondance une fois et voie ce qui a
réellement été cherché.

Ne nommer aucune nature laisse l'Internet Archive chercher dans tout et demande
`books` à la Library, qui tient un catalogue par nature et exige donc qu'on en
nomme un. La réponse le dit.

`per_source` porte aussi `searches_on`, `row_describes` et `filters_dropped` :
c'est ce qu'un appelant lit avant de comparer deux lignes ou de se fier à un
filtre.

### `get_item`

Une notice, chez l'archive que son identifiant nomme.

| Argument         | Type                              | Sens                                                              |
| ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| `identifier`     | string                            | Issu d'une recherche, `archive:<slug>`, `loc:<id>` ou `bnf:<ark>` |
| `sections`       | tableau, défaut `["description"]` | `description`, `subjects`, `copies`, `context`                    |
| `max_copies`     | entier, défaut 10                 | Exemplaires listés                                                |
| `text_offset`    | entier, défaut 0                  | Où reprendre dans la prose de la notice                           |
| `max_text_chars` | entier, 200 à 8000, défaut 1500   | Caractères de prose renvoyés                                      |

L'identifiant nomme son archive, donc la bonne est lue sans deviner. Une adresse
est routée par son hôte et son chemin. Une forme que plusieurs archives
produisent, comme une suite de chiffres nue, est **refusée** plutôt qu'envoyée à
un pari : un numéro de catalogue à la Library et un identifiant de dépôt à
l'Archive peuvent être la même chaîne et désigner deux choses. Une chaîne
qu'aucune archive n'aurait produite est refusée aussi.

Les conditions de réutilisation reviennent à chaque lecture, quelles que soient
les sections demandées. La réponse nomme à la fois ce que personne n'a demandé et
ce que l'archive ne renseigne jamais, pour qu'un `null` se lise correctement. Une
archive qui publie tout son catalogue sous une même condition l'énonce comme une
condition sur le catalogue, et sa ligne de crédit porte ce que cette condition
demande.

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
  voyage avec chaque correspondance, la note compte les débuts de page, et une
  correspondance dont l'extrait porte les mots cherchés est placée devant une
  correspondance dont l'extrait ne les porte nulle part. Cet ordre repose sur ce
  que chaque ligne énonce d'elle-même, et aucune correspondance n'est supprimée.
- **Aucun total n'est inventé et aucun compteur n'est ajouté à un autre.** L'une
  compte des documents, l'autre des feuilles.
- **Aucun classement et aucun ordre par date entre archives.** Elles ne partagent
  aucun score, et une année ne se mesure pas sur la même chose. Les lignes
  alternent, et la réponse dit comment l'ordre a été construit.
- **Un tri par date n'est jamais présenté comme une chronologie.** `oldest` et
  `newest` s'appliquent à l'intérieur de chaque archive, sur un champ de date qui
  porte une année et aucune ère : une date avant notre ère y est rangée comme une
  année de la nôtre, et une tablette d'argile peut atterrir au milieu des années 1600. Une notice qui n'énonce aucune date est placée par une valeur de
  remplacement plutôt que par son âge. La réponse dit les deux, et compte les
  lignes sous les yeux du lecteur qui ne portent aucune année, pour que la mise
  en garde soit mesurée sur la question réellement posée.
- **Aucun vocabulaire n'est traduit d'une archive à l'autre.**
- **Aucun filtre n'est rapporté comme appliqué là où il n'a jamais été envoyé.**
  Une archive dont le catalogue ne porte ni intervalle d'années ni tri ne les
  reçoit pas, et la réponse la nomme avec la raison.
- **Une requête n'est pas présentée comme une question.** Les archives cherchent
  sur des champs différents, et la réponse publie lesquels chacune a lus.
- **Une ligne n'est jamais décrite pour autre chose qu'elle-même.** Une œuvre
  comme entité n'est pas l'exemplaire d'une édition, et un identifiant que son
  archive dit provisoire est signalé comme pouvant changer.
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
Archive, qui ne publie aucun plafond pour un client comme celui-ci, six secondes
pour la Library of Congress, qui en publie un, et trois secondes pour
data.bnf.fr. `BOOKS_MIN_INTERVAL_MS` peut les élargir toutes et n'en resserre
aucune, par quelque chemin que le réglage arrive.

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

Les archives de numérisations fixent leurs conditions dépôt par dépôt, et la
plupart de leurs notices n'en énoncent aucune. Une notice qui n'énonce rien n'a
rien accordé : ce n'est pas une licence, et ce n'est pas non plus un refus. Lisez
la notice avec `get_item`, vérifiez la page de l'archive, et créditez ce que vous
reprenez.

data.bnf.fr publie ses métadonnées sous une condition : nommer la source et
indiquer la date de récupération. Toute réponse portant une de ses lignes porte
ce crédit avec la date, dans `attribution` et dans la ligne de crédit au pied du
bloc de texte. Reprenez les deux.

Ses notices peuvent pointer vers un document numérisé sur Gallica. Ce sont des
adresses à ouvrir par une personne. Ce serveur ne les requête jamais, parce que
la bibliothèque place ses métadonnées et ses contenus numérisés sous deux régimes
différents : il peut donc dire qu'un document existe à une adresse, et rien du
tout sur ce qui s'y trouve.

Chaque résultat porte un `source_url`. Servez-vous-en.
