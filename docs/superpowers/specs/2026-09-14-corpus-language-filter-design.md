# Corpus language filter: multiselect by film original language

**Date:** 2026-09-14
**Status:** approved
**Goal:** Turn the two-option corpus control (English / All films) into a
multiselect **language filter** over the film's *original language*. Default
stays "All films" (globe); a user can pick one or more languages to restrict
every site feature to films originally made in those languages. Nothing ships
until all features respect the filter (full design up front).

## Background

The `all` corpus (moviewords.org, 51,624 films) already stores each film's
TMDB `original_language`. Today the header offers only `en` (English originals,
25,515 films) vs `all` (everything). The recently-shipped dropdown
(`CorpusDropdown` in `app/src/App.tsx`) and the `all`-films default are the
first step toward this filter.

The pipeline already lays groundwork: `derive.py` writes
`all/word_year_lang.parquet` `(word, year, lang, count, movie_count)`, and
every `movie/<id>.json` + `movies.parquet` carries `original_language`. No
per-language *aggregates* are baked or consumed yet.

### Corpus shape (measured against `all/movies.parquet`, 2026-09-14)

120 distinct original languages, steep long tail:

| threshold | languages | corpus coverage |
|---|---|---|
| ≥ 2000 films | 3 (en, fr, ja) | 61% |
| ≥ 500 films | 17 | 89% |
| ≥ 300 films | 21 | 92% |
| ≥ 200 films | 29 | 96% |
| **≥ 100 films** | **35** | **98%** |
| all | 120 | 100% |

Top non-English: fr 3696, ja 2488, hi 1998, es 1929, it 1903, de 1464,
ko 1067, zh 965, ru 883, cn 778, ta 576, sv 565, pt 557, te 514, nl 506,
pl 506, tr 479, ml 469, da 446, no 301, fi 296, cs 279, tl 260, hu 241,
th 237, id 234, fa 216, ro 202, ar 197 … then 90 languages sharing 1,857 films.

**Decision:** offer the **35 languages with ≥100 films** as filter options.
Unlisted languages still count toward "All films"; they just don't get their own
selectable slice. This keeps every *selectable* language robust enough to carry
its own leaderboards/signatures while covering 98% of the corpus.

## Design decisions (locked)

1. **Scope:** every feature is language-aware (all-at-once design).
2. **Language list:** the 35 languages with ≥100 films.
3. **Architecture:** per-language bake + client-side merge (below).
4. **Degradation:** data-driven per-view, honest "based on N films" labels, film
   counts in the dropdown.
5. **Apply model:** batch "Apply" → one page reload (keeps the non-reactive
   "constant per page load" model); shareable via `?langs=`.
6. **Locale:** localize language names + float the user's language to the top;
   gentle opt-in suggestion to filter to the locale's films; never forced.

## Architecture: per-language bake + client-side merge

The filter is a **union of films** and almost every site metric is a **sum of
counts**, so we bake **one slice per language** and the frontend **adds up
whichever slices are selected**, client-side, on demand. No combinatorial bake
(2³⁵), no DuckDB-WASM engine, stays static and ~$0.

### Exactness

- **0 languages selected** → fetch today's global `all/` file. Unchanged.
- **1 language** → fetch that language's file. **Exact, no merge.** (The common
  case — a user picking their own language.)
- **2+ languages** → merge the selected slices. **Trends merge exactly** (full
  per-year series summed from `word_year_lang`). Aggregated top-K lists
  (leaderboards, boards, signatures) are **head-accurate** — a word in the merged
  top-100 is virtually always present in a contributing language's top-1000; the
  approximate tail is invisible and consistent with the "honest labels" stance.

## Pipeline / bake

Parameterize `pipeline/scripts/rebuild_web_data.py` (and the `signature/*.json`
inputs it consumes from `derive.py`) by language:

- Add a `--lang <code>` dimension. When set, the `movies` view is filtered
  `WHERE original_language = <code>` and outputs are written to
  **`all/lang/<code>/…`**. Every existing stage (`meta`, `boards`,
  `signatures`, `featured`, `trends`) then produces language-scoped outputs with
  no per-stage code changes, because they all derive from the `movies` view.
- **Baked per language** (aggregates only): `word_meta.parquet`,
  `json/leaderboard-default.json`, `json/leaderboards/{shifts,films,wonders,everywhere}.json`,
  `json/signature/{decades,genres}.json`, `json/featured-series.json`,
  `json/trend/<key>.json`, `json/year-totals.json`, and the `word_year.parquet`
  the trends stage needs.
- **Not baked per language:** `json/movie/<id>.json` (a film is one language —
  stays global under `all/`), `json/wordlists.json` (language-independent),
  `json/movies-index.json` (global, carries `lang` for client-side filtering).
- **New manifest `all/json/languages.json`:** `[{ "code": "es", "films": 1929 },
  …]` for the 35, sorted by film count, generated from `movies.parquet`. Drives
  the dropdown, its counts, and every view's "based on N films" label.
- `derive.py` must emit the per-language `signature/{decades,genres}.json` base
  inputs (the log-odds baselines) for each language, since `rebuild_web_data`'s
  `stage_signatures` extends an input file. Alternatively, compute the base
  inline in the language-parameterized run.

Bake is fast (runs on already-published parquets, no VM); 35× is acceptable and
can run sequentially. Trend files per language are bounded (few words clear the
≥20 floor in small languages). R2 storage is cheap.

### Migration: retire the standalone `en` corpus

"English" becomes the `all/lang/en/` slice. Today's separate root-level `en`
corpus bake (no prefix) is then redundant. During rollout the `en` selection can
alias the existing root bake, then cut over to `all/lang/en/` once it exists;
retire the root bake afterward. `?c=en` maps to `langs=en`, `?c=all` to empty.

## Frontend

### Languages state (generalize `app/src/lib/corpus.ts`)

Evolve the corpus module into a **languages** module:

- `activeLanguages(): string[]` — resolves `?langs=es,fr` → stored `langs` →
  **empty array = All films** (no filter). Lazy + non-reactive, mirroring
  today's `activeCorpus()`.
- `resolveLanguages(search, stored): string[]` — pure, testable; ignores unknown
  codes; back-compat: `?c=en`→`['en']`, `?c=all`→`[]`.
- `switchLanguages(codes: string[])` — persist to localStorage, set/clear
  `?langs=`, reload. Empty selection clears the param (the default).
- Retain a language registry (code → metadata) seeded from `languages.json`.

### Data layer (merge) — `app/src/lib/data.ts` + `series.ts`

`dataUrl(path)` today prepends a single corpus prefix. Replace with a
selection-aware fetch+merge:

- `langUrl(code, path)` → `${DATA_BASE}/all/lang/${code}/${path}` (and the
  global `all/${path}` when no languages selected).
- Per artifact type, a merge helper invoked only when 2+ languages are selected:
  - **Word-count lists** (leaderboard, boards' word lists, signature top lists):
    sum `count` + `movie_count` by word across slices, re-sort, take top-K.
  - **Trends** (`series.ts`): sum per-year counts across slices (exact) and sum
    the per-language `year-totals` for the rate denominator.
  - **Signatures:** merge entity `top`/count vectors, then **recompute log-odds
    client-side** — a small TS port of `derive.py:log_odds` — against the merged
    corpus counts and summed `n_corpus` / `movie_count`.
  - **Superlatives / film lists:** merge film arrays, re-rank (exact for films).
  - **Movie index / search:** fetch the global index, filter `lang ∈ selected`.
- **1 language → skip merge**, fetch the single slice. **0 → global `all/`.**
- `fetchJSON` path-caching is unchanged; merged results are derived per
  selection.

### Dropdown (multiselect) — `app/src/App.tsx`

Extend the shipped `CorpusDropdown`:

- **Trigger:** globe + summary label ("All films" / the single language's name /
  "N languages") + chevron.
- **Menu:** a search box; an "All films" reset row at top; 35 language rows, each
  a checkbox + **localized name + film count** (e.g. "Español · 1,929"); the
  user's UI-locale language floated to the top. Batch selection with an
  **Apply** button that calls `switchLanguages` (persist + reload). Escape /
  outside-click close (already implemented).

### Degradation & honesty

- Every view renders "**Based on N films**" (from `languages.json` /merged
  `movie_count`).
- Reuse existing floors: Trends `MIN_YEAR_WORDS` (applied to merged
  year-totals), signature `min_films`. Thin slices fall to the existing "not
  enough data" states.
- A fully empty view shows: "Not enough films in <languages> for this — add
  languages or switch to All films."

### Locale / i18n coordination

Coordinated with the parallel i18n (machine-translation) session. UI language
(what i18n localizes into) and film original language (this filter) are distinct
axes.

- **Names & sort:** localize language names via `Intl.DisplayNames` (fallback if
  the i18n catalog lacks them); float the user's language to the top of the
  dropdown.
- **Gentle opt-in:** on first visit in a non-English locale whose language is one
  of the 35, with no stored selection, show a dismissible hint — "Viewing in
  Spanish? Filter to Spanish-language films." One click applies; dismissal is
  persisted; never forced (avoids silently degrading small-corpus-language
  users). Default remains All films.
- The filter functions standalone if the i18n work has not merged yet.

## URL / persistence

- Canonical: `?langs=es,fr` (comma-separated ISO codes). Empty param = All films.
- `localStorage['langs']`. Back-compat aliases: `?c=en`→`langs=en`,
  `?c=all`→empty.

## Testing

- `resolveLanguages` unit tests (URL wins → stored → empty; unknown-code
  filtering; `?c=` back-compat).
- Merge-helper unit tests: summing word counts + re-sort; trend per-year
  summation vs a known multi-language fixture (exactness); client-side log-odds
  port vs the Python output on a fixture.
- `languages.json` manifest presence + shape.
- Browser-drive: single-language exactness, multi-language merge, degradation
  states, Apply→reload→persist, `?langs=` sharing.

## Open details (resolve during implementation, not blockers)

- **`cn` vs `zh`** are both Chinese in TMDB — merge into one option or list
  separately with clear labels.
- Exact bake time + R2 object count for 35× trend files (measure; parallelize if
  needed).
- Whether to keep the root `en` bake as a live alias during migration or cut
  straight to `all/lang/en/`.

## Non-goals

- Arbitrary multi-language *combinations* pre-baked (impossible; handled by
  client merge).
- Live DuckDB-WASM per-language queries (would reintroduce the 35 MB mobile
  cold-boot).
- Subtitle/dialogue *language* filtering (this is original-language only; all
  dialogue counts come from the English OpenSubtitles track).
