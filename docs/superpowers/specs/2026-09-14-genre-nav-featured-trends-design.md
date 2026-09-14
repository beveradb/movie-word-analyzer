# Genre discovery + homepage & Trends featured charts — design

**Date:** 2026-09-14
**Branch:** feat/sess-20260914-1220-genre-nav-featured-trends
**Status:** approved (design), pending implementation plan

## Problem

Three gaps in discoverability and reuse of the featured-trend idea:

1. **Genre pages are unreachable.** `#/genre/:id` renders a rich genre study
   (signature words, top words, notable films) via `EntityView`, but nothing on
   the site links to it and there is no index. The only way in is typing a URL.
   Decades, by contrast, are discoverable from the homepage "Or wander a decade"
   chips.
2. **The featured-trend chart only lives on the Trends page.** It is the most
   compelling thing on that page ("a new shift every day"), but a visitor who
   scrolls the homepage without clicking the header nav never sees it.
3. **Only today's featured trend is reachable.** `FEATURED` holds six curated
   shifts; `dayIndex()` surfaces exactly one per day. There is no way to browse
   the others without waiting for the day to roll over.

## Goals

- A "Genres" header link leading to a new genres index page.
- A lightweight version of today's featured chart on the homepage, below the
  "Or wander a decade" section.
- Forward/back buttons on the Trends featured chart to step through all six
  featured trends (so a user can reach — and return to — any of them).

## Non-goals

- No change to how genre/decade signatures are computed. No new data files.
- The heavy `words_by_word/data.parquet` (93 MB) stays off the homepage.
- No per-genre chart work; the genres index just links to existing pages.

## Approach

### Shared extraction (done first, to avoid duplicating query logic)

The featured list and the word→series query currently live only inside
`Trends.tsx`. The homepage now needs the same building blocks, so the reusable
parts are lifted out before adding the second consumer.

- **`app/src/lib/featured.ts`** (new) — move `FEATURED` and `dayIndex()` here
  from `Trends.tsx`; add a pure `stepFeatured(idx, dir, len)` helper that returns
  the next/previous index with wraparound (`dir` is `+1` or `-1`).
- **`app/src/lib/trends.ts`** (edit) — add a pure `toSeries(rows, totals, words, colors)`
  that performs the `MIN_YEAR_WORDS` year filtering and the per-million-words
  maths currently inlined in the Trends effect, returning
  `{ series, plottedYears, trimmedYears, missing }`. Kept pure (no DuckDB import)
  so it stays unit-testable alongside the existing helpers.
- **`app/src/lib/series.ts`** (new, DuckDB-touching) — owns `yearTotals()` (moved
  from `Trends.tsx`, keeping its module-level cache) and `loadWordSeries(words, colors)`,
  a thin async function that runs the `word_year.parquet` query + `yearTotals()`
  and delegates shaping to `toSeries`. Both `Trends.tsx` and the new home chart
  call it.

### 1. Genres index page + header link

- **`app/src/views/Genres.tsx`** (new) — `getSignatures('genres')`, entries
  sorted by `movie_count` descending, rendered as a responsive card grid. Each
  card shows a `GenreMotif`, the genre name, and "{movie_count} films", linking
  to the existing `#/genre/:encodeURIComponent(name)` page. Styling mirrors the
  existing homepage cards (2px ink border, hover shadow). Loading → `Spinner`;
  fetch failure → `ErrorBox` with retry to `/` (matching `EntityView`).
- **`app/src/App.tsx`** (edit) — add a `{ hash: '#/genres', label: 'Genres', match: 'genres' }`
  nav tab and a `section === 'genres'` route rendering `<GenresView />`. The tab
  is marked current for both `genres` (the index) and `genre` (a specific study).
  No route collision: the index is plural (`#/genres`), the detail stays singular
  (`#/genre/:id`).

### 2. Homepage featured preview

- **`app/src/components/FeaturedChart.tsx`** (new) — a lightweight, reusable
  featured chart: the featured title, a `LineChart` built from
  `loadWordSeries(words, COLORS)` (so it only reads `word_year.parquet`, with no
  hover top-movie notes), and a "See more trends →" link to `#/trends`. The query
  runs in `useEffect` after mount so it never blocks the hero; a `Spinner` fills
  the slot while loading. On query failure the component renders nothing, so a
  data hiccup never breaks the homepage.
- **`app/src/views/Home.tsx`** (edit) — render `<FeaturedChart>` for
  `FEATURED[dayIndex()]` in a new section directly below "Or wander a decade".

### 3. Trends featured cycle buttons

- **`app/src/views/Trends.tsx`** (edit) — replace the direct `FEATURED[dayIndex()]`
  read with a `featuredIdx` state initialised to `dayIndex()`. Add ◀ and ▶ buttons
  beside the "Featured: {title}" header that call `stepFeatured(featuredIdx, -1, FEATURED.length)`
  and `stepFeatured(featuredIdx, +1, FEATURED.length)`, plus a subtle "N of 6"
  indicator. The chart-loading effect switches to `loadWordSeries`; the existing
  top-movie effect is untouched. Cycling only applies when no words are in the URL
  (i.e. while a featured chart is showing).

## Data flow

- **Home:** mounts → hero, search, poster grid, and decade chips render from
  `movies-index.json` immediately → `FeaturedChart` effect calls
  `loadWordSeries(FEATURED[dayIndex()].words)` → DuckDB-wasm initialises and
  queries `word_year.parquet` + `yearTotals()` → `toSeries` → `LineChart`.
  (DuckDB-wasm now loads on the homepage, but deferred via `useEffect`, so it
  does not block first paint. Deliberate, accepted tradeoff for the preview.)
- **Trends:** `featuredIdx` (init `dayIndex()`); ◀/▶ update it via `stepFeatured`;
  `chartWords` derives from the active featured entry (or URL words); the effect
  calls `loadWordSeries` and sets state. The separate top-movie effect is
  unchanged.
- **Genres:** `getSignatures('genres')` → sort by film count → card grid.

## Error handling

- `FeaturedChart`: query failure → render nothing (optional homepage section).
- `Genres`: fetch failure → `ErrorBox` with retry to `/`.
- `Trends`: unchanged error box for the main chart query.

## Edge cases

- A featured word missing from the dataset: `toSeries` omits it from the series;
  legends/labels build from the drawn series (existing Trends behaviour preserved).
- `stepFeatured` wraps in both directions (index 0 back → last; last forward → 0).
- `dayIndex()` uses `Date.now()` — fine in app runtime code (only workflow
  *scripts* forbid it).
- Genres index tab does not highlight-collide with the singular genre route.

## Testing

- **Pure unit tests (vitest), matching the repo convention of testing lib logic:**
  - `toSeries` — `MIN_YEAR_WORDS` filtering, per-million calculation, `missing`
    detection, `plottedYears` gap inclusion, `trimmedYears` formatting.
  - `stepFeatured` — forward, backward, and wraparound at both ends.
- **Manual / Playwright (per project workflow, dev server on port 5173):**
  - Genres tab appears, `#/genres` lists genres, a card navigates to `#/genre/:id`.
  - Homepage shows the featured chart below the decade chips; "See more trends →"
    navigates to `#/trends`; hero paints before the chart resolves.
  - Trends ◀/▶ step the featured title + chart through all six and back; "N of 6"
    tracks; behaviour only active with no URL words.

## Files touched

New:
- `app/src/lib/featured.ts`
- `app/src/lib/featured.test.ts`
- `app/src/lib/series.ts`
- `app/src/components/FeaturedChart.tsx`
- `app/src/views/Genres.tsx`

Edited:
- `app/src/lib/trends.ts` (+ `app/src/lib/trends.test.ts`)
- `app/src/views/Home.tsx`
- `app/src/views/Trends.tsx`
- `app/src/App.tsx`
