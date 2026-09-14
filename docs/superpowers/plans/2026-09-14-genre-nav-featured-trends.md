# Genre Nav + Featured Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make genre pages discoverable via a header link + index page, add today's featured-trend chart to the homepage, and let the Trends page step through all featured trends with forward/back buttons.

**Architecture:** Lift the featured list and the word→series query out of `Trends.tsx` into shared modules (`lib/featured.ts`, a pure `toSeries` in `lib/trends.ts`, and a DuckDB-touching `lib/series.ts`), then add three consumers: a new `GenresView`, a lightweight `FeaturedChart` on the homepage, and cycle buttons on Trends.

**Tech Stack:** React 18 + TypeScript, Vite, DuckDB-wasm (via `lib/duck.ts`), Tailwind, vitest.

## Global Constraints

- Run all commands from the `app/` directory. Worktree root: `/Users/andrew/Projects/beveradb/movie-word-analyzer-genre-nav-featured-trends`.
- Test command: `npm test` (runs `vitest run`). Single file: `npx vitest run src/lib/<file>.test.ts`. Typecheck: `npx tsc -b`. Lint: `npm run lint`.
- **Copy style:** new user-facing copy uses spaced hyphen `" - "`, never em-dashes (en-dash `–` only for year ranges). Ellipsis char `…` in spinner labels matches existing style.
- Pure lib logic is unit-tested with vitest (`describe/it/expect`); React views/components are verified via the dev server + Playwright (dev server must run on port 5173 — bucket CORS).
- `MIN_YEAR_WORDS = 100_000` (already exported from `lib/trends.ts`).
- Series colors: `['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)', 'var(--color-s4)']`.

---

### Task 1: Shared featured module (`lib/featured.ts`)

**Files:**
- Create: `app/src/lib/featured.ts`
- Test: `app/src/lib/featured.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FEATURED: { title: string; words: string[] }[]`
  - `dayIndex(): number` — `Math.floor(Date.now() / 86_400_000) % FEATURED.length`
  - `stepFeatured(idx: number, dir: number, len: number): number` — next/prev index with wraparound (`dir` is `+1` or `-1`).

Note: this task *adds* `FEATURED`/`dayIndex` in a shared module; `Trends.tsx` keeps its own copy until Task 4 swaps to the import, so the build stays green throughout.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/featured.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FEATURED, stepFeatured } from './featured'

describe('stepFeatured', () => {
  it('advances forward', () => {
    expect(stepFeatured(2, 1, 6)).toBe(3)
  })

  it('steps backward', () => {
    expect(stepFeatured(2, -1, 6)).toBe(1)
  })

  it('wraps forward past the end', () => {
    expect(stepFeatured(5, 1, 6)).toBe(0)
  })

  it('wraps backward before the start', () => {
    expect(stepFeatured(0, -1, 6)).toBe(5)
  })
})

describe('FEATURED', () => {
  it('is a non-empty list of titled word groups', () => {
    expect(FEATURED.length).toBeGreaterThan(0)
    for (const f of FEATURED) {
      expect(typeof f.title).toBe('string')
      expect(f.words.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/featured.test.ts`
Expected: FAIL — cannot resolve `./featured`.

- [ ] **Step 3: Write the implementation**

Create `app/src/lib/featured.ts`:

```ts
/** Landing charts, rotated daily so featured views never open empty. Every word
 * is a verified riser/faller from the shifts leaderboard. */
export const FEATURED: { title: string; words: string[] }[] = [
  { title: 'The phone replaced the telegram', words: ['phone', 'telegram'] },
  { title: "How movies stopped saying 'shall'", words: ['gonna', 'shall'] },
  { title: 'Screens took over the script', words: ['computer', 'tv', 'radio'] },
  { title: "From 'fellow' to 'dude'", words: ['dude', 'fellow'] },
  { title: 'Cinema learned to swear', words: ['fucking', 'darling'] },
  { title: 'Monsieur, madame - au revoir', words: ['monsieur', 'madame', 'okay'] },
]

/** Today's featured index — rotates once per day. */
export const dayIndex = () => Math.floor(Date.now() / 86_400_000) % FEATURED.length

/** Next (dir=+1) or previous (dir=-1) featured index, wrapping at both ends. */
export const stepFeatured = (idx: number, dir: number, len: number) => (idx + dir + len) % len
```

Note: the last title's em-dash from the old `Trends.tsx` copy is replaced with a spaced hyphen per the copy-style constraint.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/featured.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/featured.ts app/src/lib/featured.test.ts
git commit -m "feat: shared featured-trends module with stepFeatured helper"
```

---

### Task 2: Pure `toSeries` shaper (`lib/trends.ts`)

**Files:**
- Modify: `app/src/lib/trends.ts`
- Test: `app/src/lib/trends.test.ts`

**Interfaces:**
- Consumes: existing `MIN_YEAR_WORDS`, `formatYearRanges` from `lib/trends.ts`; `Series` type from `components/LineChart`.
- Produces:
  - `interface YearRow { word: string; year: number; count: number }`
  - `interface WordSeries { series: Series[]; plottedYears: number[]; trimmedYears: string | null; missing: string[] }`
  - `toSeries(rows: YearRow[], totals: Map<number, number>, words: string[], colors: string[]): WordSeries`

This is the exact shaping logic currently inlined in the `Trends.tsx` chart effect, extracted verbatim so behaviour is preserved (post-filter color indexing, per-million maths, gap-inclusive `plottedYears`).

- [ ] **Step 1: Write the failing test**

Add to `app/src/lib/trends.test.ts` (append a new `describe` block; keep existing imports and add `toSeries`):

```ts
import { toSeries } from './trends'

describe('toSeries', () => {
  const totals = new Map([
    [1980, 200_000],
    [1981, 50_000], // below MIN_YEAR_WORDS floor
    [1982, 300_000],
  ])
  const rows = [
    { word: 'love', year: 1980, count: 100 },
    { word: 'love', year: 1981, count: 999 }, // dropped: year below floor
    { word: 'love', year: 1982, count: 300 },
    { word: 'war', year: 1980, count: 50 },
  ]

  it('reports years dropped for being below the corpus-size floor', () => {
    expect(toSeries(rows, totals, ['love', 'war'], ['c1', 'c2']).trimmedYears).toBe('1981')
  })

  it('builds per-million-words series with post-filter colors', () => {
    expect(toSeries(rows, totals, ['love', 'war'], ['c1', 'c2']).series).toEqual([
      {
        name: 'love',
        color: 'c1',
        points: [
          { x: 1980, y: (100 / 200_000) * 1_000_000 },
          { x: 1982, y: (300 / 300_000) * 1_000_000 },
        ],
      },
      { name: 'war', color: 'c2', points: [{ x: 1980, y: (50 / 200_000) * 1_000_000 }] },
    ])
  })

  it('lists plotted years across the kept range, floor gaps excluded', () => {
    expect(toSeries(rows, totals, ['love'], ['c1']).plottedYears).toEqual([1980, 1982])
  })

  it('reports words with no kept data as missing', () => {
    expect(toSeries(rows, totals, ['love', 'ghost'], ['c1', 'c2']).missing).toEqual(['ghost'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/trends.test.ts`
Expected: FAIL — `toSeries` is not exported.

- [ ] **Step 3: Write the implementation**

In `app/src/lib/trends.ts`, add a type-only import at the top of the file (after any existing imports; the file currently has none, so add this as the first line):

```ts
import type { Series } from '../components/LineChart'
```

Then append at the end of the file:

```ts
export interface YearRow {
  word: string
  year: number
  count: number
}

export interface WordSeries {
  series: Series[]
  plottedYears: number[]
  trimmedYears: string | null
  missing: string[]
}

/** Shape raw word_year rows into chart series (uses per million words of
 * dialogue), plus the plotted-year list, trimmed-year note, and missing words.
 * Years whose whole-corpus word total is below MIN_YEAR_WORDS are dropped as
 * too sparse for a reliable rate. Colors are assigned by drawn-series order. */
export function toSeries(
  rows: YearRow[],
  totals: Map<number, number>,
  words: string[],
  colors: string[],
): WordSeries {
  const kept = rows.filter((r) => (totals.get(r.year) ?? 0) >= MIN_YEAR_WORDS)
  const droppedYears = [
    ...new Set(rows.filter((r) => (totals.get(r.year) ?? 0) < MIN_YEAR_WORDS).map((r) => r.year)),
  ].sort((a, b) => a - b)
  const trimmedYears = droppedYears.length ? formatYearRanges(droppedYears) : null

  const byWord = new Map<string, YearRow[]>()
  kept.forEach((r) => byWord.set(r.word, [...(byWord.get(r.word) ?? []), r]))
  const missing = words.filter((w) => !byWord.has(w))

  const keptYears = kept.map((r) => r.year)
  const plottedYears = keptYears.length
    ? [...totals.entries()]
        .filter(([y, t]) => t >= MIN_YEAR_WORDS && y >= Math.min(...keptYears) && y <= Math.max(...keptYears))
        .map(([y]) => y)
        .sort((a, b) => a - b)
    : []

  const series = words
    .filter((w) => byWord.has(w))
    .map((w, i) => ({
      name: w,
      color: colors[i],
      points: byWord.get(w)!.map((r) => ({ x: r.year, y: (r.count / (totals.get(r.year) ?? 1)) * 1_000_000 })),
    }))

  return { series, plottedYears, trimmedYears, missing }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/trends.test.ts`
Expected: PASS (existing tests + 4 new `toSeries` tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/trends.ts app/src/lib/trends.test.ts
git commit -m "feat: extract pure toSeries shaper from Trends chart effect"
```

---

### Task 3: DuckDB word-series loader (`lib/series.ts`)

**Files:**
- Create: `app/src/lib/series.ts`

**Interfaces:**
- Consumes: `q`, `pq`, `lit` from `lib/duck`; `toSeries`, `WordSeries`, `YearRow` from `lib/trends`.
- Produces:
  - `yearTotals(): Promise<Map<number, number>>` — whole-corpus word total per year, memoised in a module-level cache (moved verbatim from `Trends.tsx`).
  - `loadWordSeries(words: string[], colors: string[]): Promise<WordSeries>` — runs the `word_year.parquet` query + `yearTotals()`, returns `toSeries(...)`.

No unit test: this module touches DuckDB-wasm (browser-only). It is exercised by Tasks 4–6 and verified in the final Playwright pass. Correctness of the shaping lives in Task 2's `toSeries` tests.

- [ ] **Step 1: Write the implementation**

Create `app/src/lib/series.ts`:

```ts
import { lit, pq, q } from './duck'
import { toSeries, type WordSeries, type YearRow } from './trends'

let yearTotalsCache: Map<number, number> | null = null

/** Whole-corpus word total per release year, cached for the session. */
export async function yearTotals(): Promise<Map<number, number>> {
  if (yearTotalsCache) return yearTotalsCache
  const rows = await q<{ year: number; total: number }>(
    `SELECT year, SUM(count)::DOUBLE AS total FROM ${pq('word_year.parquet')} GROUP BY year`,
  )
  yearTotalsCache = new Map(rows.map((r) => [r.year, r.total]))
  return yearTotalsCache
}

/** Load per-year usage rates for the given words and shape them into chart
 * series. Reads only word_year.parquet (small) - no top-movie join. */
export async function loadWordSeries(words: string[], colors: string[]): Promise<WordSeries> {
  const [rows, totals] = await Promise.all([
    q<YearRow>(
      `SELECT word, year, count::DOUBLE AS count FROM ${pq('word_year.parquet')}
       WHERE word IN (${words.map(lit).join(',')}) ORDER BY word, year`,
    ),
    yearTotals(),
  ])
  return toSeries(rows, totals, words, colors)
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd app && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/series.ts
git commit -m "feat: loadWordSeries + shared yearTotals in lib/series"
```

---

### Task 4: Refactor Trends to shared modules + add cycle buttons

**Files:**
- Modify: `app/src/views/Trends.tsx`

**Interfaces:**
- Consumes: `FEATURED`, `dayIndex`, `stepFeatured` from `lib/featured`; `loadWordSeries` from `lib/series`; keeps `YearTopMovie`, `groupTopMovies`, `topMovieRows` from `lib/trends`.
- Produces: no new exports.

This removes the now-duplicated `FEATURED`/`dayIndex`/`yearTotals`/`YearRow` from `Trends.tsx`, routes the chart query through `loadWordSeries`, and adds ◀/▶ featured-cycle buttons driven by a `featuredIdx` state. The separate top-movie effect (lines ~293–310) is left untouched.

- [ ] **Step 1: Update the imports**

Replace the existing trends-lib import block (currently):

```ts
import {
  MIN_YEAR_WORDS,
  type YearTopMovie,
  formatYearRanges,
  groupTopMovies,
  topMovieRows,
} from '../lib/trends'
```

with:

```ts
import { type YearTopMovie, groupTopMovies, topMovieRows } from '../lib/trends'
import { FEATURED, dayIndex, stepFeatured } from '../lib/featured'
import { loadWordSeries } from '../lib/series'
```

- [ ] **Step 2: Remove the moved definitions**

Delete the local `FEATURED` array and `dayIndex` (the block starting `/** Landing charts, rotated daily …` through `const dayIndex = () => …`).

Delete the local `YearRow` interface, the `yearTotalsCache` variable, and the `yearTotals` async function (the block starting `interface YearRow {` through the end of `async function yearTotals()`).

- [ ] **Step 3: Add `featuredIdx` state and derive `featured` from it**

Replace:

```ts
  // no words in the URL → chart today's featured shift instead of a blank page
  const featured = words.length === 0 ? FEATURED[dayIndex()] : null
```

with:

```ts
  // no words in the URL → chart a featured shift instead of a blank page;
  // starts on today's, steppable via the ◀/▶ buttons below
  const [featuredIdx, setFeaturedIdx] = useState(dayIndex)
  const featured = words.length === 0 ? FEATURED[featuredIdx] : null
```

- [ ] **Step 4: Route the chart effect through `loadWordSeries`**

Replace the entire first `useEffect` (the one running the `word_year.parquet` + `yearTotals()` `Promise.all` and calling `setTrimmedYears`/`setMissing`/`setPlottedYears`/`setSeries`) with:

```ts
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadWordSeries(chartWords, COLORS)
      .then(({ series, plottedYears, trimmedYears, missing }) => {
        if (cancelled) return
        setSeries(series)
        setPlottedYears(plottedYears)
        setTrimmedYears(trimmedYears)
        setMissing(missing)
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [wordsKey])
```

- [ ] **Step 5: Add the ◀/▶ cycle buttons to the featured header**

Replace the featured-title header block (currently):

```tsx
          {featured && (
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
              <h2 className="slug text-sm">Featured: {featured.title}</h2>
              <span className="font-script text-xs text-ink-2">a new shift every day — or chart your own word above</span>
            </div>
          )}
```

with:

```tsx
          {featured && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFeaturedIdx((i) => stepFeatured(i, -1, FEATURED.length))}
                  aria-label="Previous featured trend"
                  className="border-2 border-ink px-2 font-script font-bold hover:bg-mark"
                >
                  ◀
                </button>
                <button
                  onClick={() => setFeaturedIdx((i) => stepFeatured(i, 1, FEATURED.length))}
                  aria-label="Next featured trend"
                  className="border-2 border-ink px-2 font-script font-bold hover:bg-mark"
                >
                  ▶
                </button>
                <h2 className="slug text-sm">Featured: {featured.title}</h2>
              </div>
              <span className="font-script text-xs text-ink-2">
                {featuredIdx + 1} of {FEATURED.length} - a new shift every day
              </span>
            </div>
          )}
```

- [ ] **Step 6: Typecheck, lint, and run the full test suite**

Run: `cd app && npx tsc -b && npm run lint && npm test`
Expected: no type errors, no lint errors, all vitest tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/src/views/Trends.tsx
git commit -m "feat: Trends uses shared featured/series modules + ◀▶ cycle buttons"
```

---

### Task 5: Homepage featured chart component (`components/FeaturedChart.tsx`)

**Files:**
- Create: `app/src/components/FeaturedChart.tsx`

**Interfaces:**
- Consumes: `loadWordSeries` from `lib/series`; `LineChart`, `Series` from `components/LineChart`; `Spinner` from `components/ui`.
- Produces: `FeaturedChart({ title, words }: { title: string; words: string[] })` — a self-contained chart card; renders `null` if the query fails.

- [ ] **Step 1: Write the implementation**

Create `app/src/components/FeaturedChart.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Series } from './LineChart'
import { LineChart } from './LineChart'
import { loadWordSeries } from '../lib/series'
import { Spinner } from './ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)', 'var(--color-s4)']

/** Lightweight featured-trend chart for the homepage: one featured shift charted
 * from word_year.parquet only (no top-movie hover notes), with a link into the
 * full Trends page. Deferred in an effect so it never blocks first paint;
 * renders nothing if the query fails, so a data hiccup can't break the page. */
export function FeaturedChart({ title, words }: { title: string; words: string[] }) {
  const [series, setSeries] = useState<Series[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSeries(null)
    setFailed(false)
    loadWordSeries(words, COLORS)
      .then(({ series }) => !cancelled && setSeries(series))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [words.join(',')])

  if (failed) return null
  return (
    <div className="border-2 border-ink bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
        <h2 className="slug text-sm">Featured: {title}</h2>
        <a href="#/trends" className="font-script text-xs underline hover:bg-mark">
          See more trends →
        </a>
      </div>
      {series === null ? (
        <Spinner label="Charting today's featured shift…" />
      ) : (
        <>
          <LineChart series={series} yLabel="uses per million words" />
          <p className="mt-2 text-right text-xs text-ink-2">uses per million words of dialogue</p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd app && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/FeaturedChart.tsx
git commit -m "feat: lightweight FeaturedChart component for the homepage"
```

---

### Task 6: Add the featured chart to the homepage (`views/Home.tsx`)

**Files:**
- Modify: `app/src/views/Home.tsx`

**Interfaces:**
- Consumes: `FeaturedChart` from `components/FeaturedChart`; `FEATURED`, `dayIndex` from `lib/featured`.
- Produces: no new exports.

- [ ] **Step 1: Add the imports**

At the top of `app/src/views/Home.tsx`, add:

```ts
import { FeaturedChart } from '../components/FeaturedChart'
import { FEATURED, dayIndex } from '../lib/featured'
```

- [ ] **Step 2: Compute today's featured entry**

Inside `HomeView`, just before the `return (`, add:

```ts
  const today = FEATURED[dayIndex()]
```

- [ ] **Step 3: Insert the featured section below the decades section**

Immediately after the closing `</section>` of the "Or wander a decade" block and before the "About this dataset" `<section>`, add:

```tsx
      <section className="mt-10">
        <h2 className="slug border-b-2 border-ink pb-1 text-sm">Watch a word move</h2>
        <p className="mb-4 mt-2 text-sm text-ink-2">
          A new shift every day - one word&apos;s rise or fall across the decades.
        </p>
        <FeaturedChart title={today.title} words={today.words} />
      </section>
```

- [ ] **Step 4: Typecheck and lint**

Run: `cd app && npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/views/Home.tsx
git commit -m "feat: show today's featured trend chart on the homepage"
```

---

### Task 7: Genres index page + header nav link (`views/Genres.tsx`, `App.tsx`)

**Files:**
- Create: `app/src/views/Genres.tsx`
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: `getSignatures` from `lib/data`; `navigate` from `lib/route`; `ErrorBox`, `Spinner` from `components/ui`; `GenreMotif` from `components/motifs`.
- Produces: `GenresView()` — the `#/genres` index.

- [ ] **Step 1: Write the GenresView implementation**

Create `app/src/views/Genres.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { getSignatures } from '../lib/data'
import { navigate } from '../lib/route'
import { ErrorBox, Spinner } from '../components/ui'
import { GenreMotif } from '../components/motifs'

interface GenreCard {
  name: string
  movie_count: number
}

/** Index of every genre study, sorted by film count - the discovery path into
 * the per-genre #/genre/:id pages. */
export function GenresView() {
  const [genres, setGenres] = useState<GenreCard[] | null | undefined>(undefined)

  useEffect(() => {
    getSignatures('genres')
      .then((all) =>
        setGenres(
          Object.entries(all)
            .map(([name, e]) => ({ name, movie_count: e.movie_count }))
            .sort((a, b) => b.movie_count - a.movie_count),
        ),
      )
      .catch(() => setGenres(null))
  }, [])

  if (genres === undefined) return <Spinner label="Loading genres…" />
  if (genres === null)
    return <ErrorBox message="Couldn't load genres." retry={() => navigate('/')} />

  return (
    <div>
      <div className="border-b-2 border-ink pb-2">
        <p className="font-script text-xs uppercase tracking-widest text-ink-2">Browse by</p>
        <h1 className="slug mt-1 text-3xl sm:text-4xl">GENRES</h1>
        <p className="mt-1 font-script text-sm text-ink-2">
          What each genre talks about - {genres.length} studies.
        </p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {genres.map((g) => (
          <button
            key={g.name}
            onClick={() => navigate(`/genre/${encodeURIComponent(g.name)}`)}
            className="flex items-center gap-3 border-2 border-ink bg-card p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <GenreMotif genre={g.name} className="h-10 w-10 shrink-0 text-ink-3" />
            <div className="min-w-0">
              <div className="truncate font-script text-sm font-bold">{g.name}</div>
              <div className="text-xs text-ink-2">{g.movie_count.toLocaleString()} films</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire GenresView into App**

In `app/src/App.tsx`:

Add the import alongside the other view imports:

```ts
import { GenresView } from './views/Genres'
```

Add a `Genres` tab to the `TABS` array (place it second, after Explore):

```ts
const TABS = [
  { hash: '#/', label: 'Explore', match: '' },
  { hash: '#/genres', label: 'Genres', match: 'genres' },
  { hash: '#/trends', label: 'Trends', match: 'trends' },
  { hash: '#/leaderboard', label: 'Leaderboard', match: 'leaderboard' },
  { hash: '#/compare', label: 'Compare', match: 'compare' },
]
```

Add an `isActive` helper inside `App`, just after `const section = route.path[0] ?? ''`:

```ts
  // the Genres tab stays lit on a specific genre study (#/genre/:id) too
  const isActive = (t: (typeof TABS)[number]) =>
    section === t.match || (t.match === 'genres' && section === 'genre')
```

Update the nav `<a>` to use `isActive(t)` in both places that currently read `section === t.match`:

```tsx
              <a
                key={t.label}
                href={t.hash}
                aria-current={isActive(t) ? 'page' : undefined}
                className={`px-3 py-1.5 ${
                  isActive(t) ? 'bg-ink text-paper' : 'hover:bg-mark'
                }`}
              >
                {t.label}
              </a>
```

Add the route in the `<main>` block, next to the other section routes (e.g. after the `trends` line):

```tsx
        {section === 'genres' && <GenresView />}
```

- [ ] **Step 3: Typecheck, lint, run full suite**

Run: `cd app && npx tsc -b && npm run lint && npm test`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/views/Genres.tsx app/src/App.tsx
git commit -m "feat: genres index page + header nav link"
```

---

### Task 8: End-to-end verification (dev server + Playwright)

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server on port 5173**

Run: `cd app && npm run dev` (must be port 5173 for bucket CORS). Leave running.

- [ ] **Step 2: Verify the homepage featured chart**

Load `http://localhost:5173/`. Confirm:
- Hero + search + poster grid + decade chips paint immediately.
- Below "Or wander a decade", a "Watch a word move" section shows a "Featured: …" chart card (spinner first, then a line chart).
- "See more trends →" navigates to `#/trends`.

- [ ] **Step 3: Verify the Genres index + nav link**

- Header shows a "Genres" tab. Click it → `#/genres` lists genre cards with film counts, sorted descending.
- The "Genres" tab is highlighted on both `#/genres` and after clicking into a genre (`#/genre/:id`).
- Clicking a genre card opens its existing study page.

- [ ] **Step 4: Verify the Trends cycle buttons**

- Load `#/trends` (no words). Note the "Featured: …" title and "N of 6".
- Click ▶ several times: title + chart + "N of 6" advance and wrap from 6 back to 1.
- Click ◀: steps back, wrapping from 1 to 6.
- Type a word and "Chart it" → the featured block (and buttons) disappear, replaced by the charted word.

- [ ] **Step 5: Final full check**

Run: `cd app && npx tsc -b && npm run lint && npm test`
Expected: clean typecheck, clean lint, all tests pass. Stop the dev server.

---

## Self-Review Notes

- **Spec coverage:** shared extraction → Tasks 1–3; genres index + nav → Task 7; homepage preview → Tasks 5–6; Trends cycle buttons → Task 4; testing → Tasks 1–2 (pure) + Task 8 (E2E). All spec sections mapped.
- **Type consistency:** `toSeries`/`WordSeries`/`YearRow` (Task 2) are consumed unchanged by `loadWordSeries` (Task 3) and the Trends effect (Task 4); `loadWordSeries(words, colors)` signature matches its calls in Tasks 4–5; `FEATURED`/`dayIndex`/`stepFeatured` (Task 1) match usages in Tasks 4 and 6; `FeaturedChart({title, words})` (Task 5) matches the call in Task 6.
- **No placeholders:** every code step contains complete code; commands have expected output.
