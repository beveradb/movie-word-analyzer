# MovieWords UX iteration — filters, leaderboards, landing pages

**Date:** 2026-09-12
**Status:** approved
**Scope:** frontend (`app/`) + local data regeneration (`pipeline/`) + R2 upload. No VM required.

## Problem

1. **POS filters are unintuitive.** Chips ("nouns", "verbs"…) are include-filters, but
   `word_meta.classes` carries *every* WordNet sense a word can have (`know` = `nv`,
   `right` = `anrv`), so clicking "nouns" barely filters anything — nearly every common
   verb has an obscure noun sense. Words with no meta row pass every filter (`we'll`,
   `ain't`). The filter bar is hidden behind a "FILTER WORDS" disclosure click, and
   "hide everyday words" is unexplained jargon that overlaps with a separate "hide
   stopwords" checkbox in a different box.
2. **Default leaderboard is boring** — raw most-spoken words are connective tissue
   (`know`, `get`, `like`).
3. **Only one leaderboard** exists; the data supports many more interesting lists.
4. **Trends and Compare land empty** — user must know what to type before seeing
   anything, despite the chart/compare rendering being the good part.

## Design

### 1. Data: word_meta v2 (dominant POS + distinctiveness)

New **local** pipeline script (pattern: `pipeline/scripts/`), reading the existing
published parquets over HTTP (or a local download), producing and uploading to R2:

- `word_meta.parquet` gains:
  - **`pos`** (VARCHAR, 1 char): exactly one dominant part of speech per word:
    `n`/`v`/`a`/`r` chosen by WordNet lemma sense-frequency counts
    (`lemma.count()` summed per POS; ties broken by WordNet's first-synset order);
    `x` for words WordNet doesn't know (names, interjections, contractions, oddities).
    `know`→`v`, `war`→`n`, `right`→`r` or `a` (whichever dominates), `uh`→`x`.
  - **`dist`** (DOUBLE): movie-distinctiveness = `log2(corpus_rate / english_rate)`
    where corpus_rate is per-million from `words_by_word` totals and english_rate is
    derived from wordfreq Zipf (`10^(zipf-3)` per million). Words with zipf 0 get a
    floor (treat as zipf 1.0) to avoid infinities.
  - Existing `zipf` and `classes` columns are **kept** (back-compat with cached
    clients and any old JSON).
- `json/leaderboard-default.json` rebuilt: word rows gain `pos` and `dist` fields.
- Unit tests in `pipeline/tests/` for the dominant-POS chooser and the dist formula
  (fixed expectations for a handful of known words).

### 2. Filter bar redesign (`app/src/components/WordFilter.tsx` + call sites)

- **Always visible** — remove the disclosure button entirely.
- **Word-kind chips**: `all · nouns · verbs · adjectives · adverbs · names & other`.
  - Include semantics over the new single `pos` value; each word belongs to exactly
    one kind, so "nouns" shows only nouns.
  - Multi-select allowed (nouns+verbs shows both). None selected = "all" chip shown
    active. Clicking "all" clears kind selection.
  - Words with a missing meta row are treated as `x` (names & other) — nothing
    bypasses the filter.
- **One commonness control** replacing both the "hide everyday words" chip and the
  "hide stopwords" checkbox: segmented toggle **`interesting words | all words`**,
  default **interesting**. Interesting = hide (stopword list ∪ Zipf ≥ 5.0).
  Caption below the bar: *"hiding everyday English — the ~2,000 most common words
  (the, know, get…)"* shown only in interesting mode.
- The Leaderboard's separate "hide stopwords" checkbox is removed (subsumed).
- `WordFilterState` becomes `{ common: 'interesting' | 'all', pos: Set<string> }`;
  `passesFilter` reads row `pos` (single letter) falling back to `'x'`.
- Vitest unit tests for `passesFilter` covering every chip combination, missing-meta
  rows, and both commonness modes.

### 3. Leaderboard page → five leaderboards

Tab strip (screenplay-styled) at the top of the Leaderboard view. All new tabs are
pre-baked JSON (hot path, no WASM); the Words tab keeps its WASM path for custom
year/genre filtering.

- **Words** (existing list): defaults to interesting-words view via the new filter
  bar. New sort toggle `most spoken | most movie-ish` — movie-ish orders by
  `count × dist` (clamped dist ≥ 0) so high-frequency but film-flavored words rise.
- **Risers & fallers** (`json/leaderboards/trends.json`): from `word_year`, decade
  buckets 1930s→2020s; for words with ≥5k total uses and presence in ≥6 decades,
  score = log-ratio of last-two-decades mean rate vs first-two-decades mean rate.
  Top 50 risers + top 50 fallers, stored with per-decade rates for sparklines. Each
  row links to `/trends?w=<word>`.
- **Film superlatives** (`json/leaderboards/films.json`): top 20 each — chattiest
  (words/minute, requires runtime present), biggest vocabulary (unique_words),
  sweariest (profanity per 1k words), most repetitive (lowest unique/total ratio,
  min 5k words). Computed from `movies.parquet` + `words_by_movie` + profanity list.
- **One-film wonders** (`json/leaderboards/wonders.json`): words with total count
  ≥ 300 where a single film accounts for ≥ 60% of all uses. Show word, the film,
  its count, and share. Sorted by count. Top 50.
- **Said in every movie** (`json/leaderboards/ubiquity.json`): words ranked by share
  of films containing them. Top 50 with percentages.

Build script `pipeline/scripts/build_leaderboards.py` (+ tests on a small fixture
dataset); output uploaded to R2 alongside existing JSON.

### 4. Trends landing

- When no `w` param: auto-load a **featured chart** instead of an empty page.
  A small curated list of pairings lives in the frontend (seeded from the
  risers/fallers data at build time, e.g. `phone vs telegram`, `dude vs madam`,
  `radio vs internet`), selected by day-of-year rotation. Heading like
  *"Featured: the rise of 'phone' (and the fall of 'telegram')"*.
- The try-chips remain below the chart; typing/charting replaces the featured view
  (it just navigates to `?w=` as today).
- Add a compact **risers & fallers strip** under the featured chart linking into the
  full leaderboard tab.

### 5. Compare landing + richer comparisons

- Empty state auto-loads a rotating classic matchup (same three as today's chips,
  day-rotated) — the page is never blank. Chips remain to switch.
- **Signature JSONs extended** (derive change in the same local build script):
  each decade/genre entry gains `swears_per_1k`, `words_per_film`,
  `unique_words`, and `top500` `[word, count]` (top 500 words by count) to support
  head-to-head rate ratios without WASM.
- **Head-to-head section** (2+ entities): for each entity, top ~10 words it says
  ≥3× more often (per-million rate ratio, min 30 uses) than every other selected
  entity, computed client-side from `top500` (movies use their existing `top_all`).
  Replaces the "shared signature words" box as the star of the page (shared box
  stays, moved below).
- **Stat rows for all entity kinds**: swears/1k (currently movie-only), words per
  film, vocabulary size.
- Genre/decade cards get a **films-per-year sparkline** rendered client-side from
  `movies-index.json` (already loaded for search).

### 6. Testing & rollout

- Pipeline: pytest for POS chooser, dist, leaderboard builders (fixture corpus).
- App: Vitest for filter logic and head-to-head ratio math; Playwright e2e against
  a local preview hitting real R2 data — walk every filter chip combination on the
  leaderboard and assert row properties (e.g. nouns tab shows only `pos='n'` words),
  check all five leaderboard tabs render, trends/compare land non-empty.
- Rollout order: upload new parquet + JSON to R2 first (additive, old app ignores
  new fields), then deploy the app via wrangler. Verify prod manually + Playwright
  smoke against the live URL.
- Work happens in a worktree branch; ship via the standard /test → /coderabbit →
  /pr flow.

## Out of scope

- No new corpus processing on the VM; translated-subs films, TV, other languages
  remain excluded.
- No server-side anything — the site stays fully static.
- Mobile layout polish beyond keeping the new bars responsive.
