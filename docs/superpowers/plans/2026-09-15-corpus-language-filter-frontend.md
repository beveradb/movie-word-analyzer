# Corpus Language Filter — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every site feature respect a multiselect **original-language**
filter, reading the per-language slices from Plan 1 (`all/lang/<code>/…`) and
merging the selected languages client-side.

**Architecture:** A `languages` state module (replacing the corpus module)
resolves the selected codes from `?langs=` → stored → empty (= All films).
Aggregate JSON getters fetch each selected language's slice and merge (single =
exact, trends exact, count-lists head-accurate); the movie index is global and
filtered by `lang`; the three direct-engine surfaces gain a language `WHERE`
clause. A multiselect dropdown persists the selection and reloads (batch Apply).

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, Vitest, DuckDB-WASM
(engine fallback only). Data at `data.moviewords.org`.

## Global Constraints

- Depends on Plan 1 outputs: `all/json/languages.json`
  (`[{code, films}]`) and `all/lang/<code>/…` aggregate slices.
- Selection model: `?langs=es,fr` → `localStorage['langs']` → **empty = All
  films** (no filter). Back-compat: `?c=en`→`['en']`, `?c=all`→`[]`.
- **0 languages** → fetch today's global `all/` file (unchanged). **1** → that
  language's slice (exact, no merge). **2+** → merge. **Trends merge exactly**;
  aggregated top-K lists are head-accurate.
- Global (never per-language): `json/movie/<id>.json`, `json/movies-index.json`
  (carries `lang`), `json/wordlists.json`.
- Vite dev server MUST run on port **5173** (bucket CORS allowlist).
- Copy style: hyphens `-`, never em-dashes (en-dash year ranges OK).
- Run tests with `cd app && npx vitest run`. Verify UI on port 5173.

---

## File Structure

- **Rename/replace** `app/src/lib/corpus.ts` → **`app/src/lib/languages.ts`**
  (selection state + registry). Keep a thin `corpus.ts` re-export only if other
  code needs the `Corpus` type during migration; otherwise delete.
- **Create** `app/src/lib/logOdds.ts` — TS port of `derive.py:log_odds`.
- **Create** `app/src/lib/merge.ts` — pure merge helpers for each artifact type.
- **Modify** `app/src/lib/data.ts` — `globalUrl`/`langUrl`, `fetchLangMerged`,
  language-aware aggregate getters, filtered movie-index selector.
- **Modify** `app/src/lib/series.ts` — language-aware trends + featured + engine
  fallbacks.
- **Modify** `app/src/lib/duck.ts` — a `langFilterSql()` helper for engine
  queries; keep `pq` reading the global `all/` parquets.
- **Modify** `app/src/views/Leaderboard.tsx`, `app/src/views/Compare.tsx` —
  language `WHERE` on their direct engine queries.
- **Modify** `app/src/App.tsx` — multiselect `CorpusDropdown` → `LanguageFilter`.
- **Modify** `app/src/views/{Home,Trends,Entity,Decades,Genres}.tsx`,
  `app/src/components/boards.tsx` — "based on N films" labels + empty states.
- **Create** `app/src/components/LocaleFilterHint.tsx` — gentle opt-in banner.
- **Tests:** `app/src/lib/languages.test.ts`, `logOdds.test.ts`,
  `merge.test.ts`, extend `series`/`data` coverage.

---

## Task 1: Languages selection module

**Files:**
- Create: `app/src/lib/languages.ts`
- Delete: `app/src/lib/corpus.ts` (after callers move; see Task 7/8)
- Test: `app/src/lib/languages.test.ts`

**Interfaces:**
- Produces:
  - `resolveLanguages(search: string, stored: string | null): string[]` — ordered
    unique ISO codes; `?langs=` wins, then stored; unknown/empty → `[]`;
    back-compat `?c=en`→`['en']`, `?c=all`→`[]`.
  - `activeLanguages(): string[]` — lazy, per-load constant (mirrors the old
    `activeCorpus`).
  - `switchLanguages(codes: string[]): void` — persist + reload; empty clears
    `?langs=`.
  - `LanguageOption { code: string; films: number }`,
    `getLanguages(): Promise<LanguageOption[]>` — fetches `json/languages.json`
    (global `all/`), cached.
  - `languageName(code: string, locale?: string): string` — via
    `Intl.DisplayNames`; falls back to the code upper-cased.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/languages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveLanguages, languageName } from './languages'

describe('resolveLanguages', () => {
  it('defaults to empty (All films)', () => {
    expect(resolveLanguages('', null)).toEqual([])
  })
  it('reads ?langs= as ordered unique codes', () => {
    expect(resolveLanguages('?langs=es,fr,es', null)).toEqual(['es', 'fr'])
  })
  it('URL wins over stored', () => {
    expect(resolveLanguages('?langs=ja', 'es,fr')).toEqual(['ja'])
  })
  it('falls back to stored when no param', () => {
    expect(resolveLanguages('', 'es,fr')).toEqual(['es', 'fr'])
  })
  it('back-compat: ?c=en -> [en], ?c=all -> []', () => {
    expect(resolveLanguages('?c=en', null)).toEqual(['en'])
    expect(resolveLanguages('?c=all', null)).toEqual([])
  })
  it('drops blanks/whitespace', () => {
    expect(resolveLanguages('?langs=es,,%20fr%20', null)).toEqual(['es', 'fr'])
  })
})

describe('languageName', () => {
  it('localizes known codes', () => {
    expect(languageName('es', 'en')).toBe('Spanish')
    expect(languageName('fr', 'en')).toBe('French')
  })
  it('falls back to upper-cased code for unknowns', () => {
    expect(languageName('zz', 'en')).toBe('ZZ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/languages.test.ts`
Expected: FAIL — cannot find module `./languages`.

- [ ] **Step 3: Write `languages.ts`**

Create `app/src/lib/languages.ts`:

```ts
import { fetchJSON } from './data'

const STORAGE_KEY = 'langs'

export interface LanguageOption {
  code: string
  films: number
}

const clean = (list: string[]) =>
  [...new Set(list.map((s) => s.trim()).filter(Boolean))]

/** URL ?langs= wins, then stored preference, then [] (= All films).
 * Back-compat with the retired corpus toggle: ?c=en -> ['en'], ?c=all -> []. */
export function resolveLanguages(search: string, stored: string | null): string[] {
  const params = new URLSearchParams(search)
  const fromUrl = params.get('langs')
  if (fromUrl !== null) return clean(fromUrl.split(','))
  const c = params.get('c')
  if (c === 'en') return ['en']
  if (c === 'all') return []
  if (stored) return clean(stored.split(','))
  return []
}

let active: string[] | null = null

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The selected languages for this page load. Non-reactive: the batch-Apply
 * model reloads on change, so downstream code treats this as a constant. */
export function activeLanguages(): string[] {
  if (!active) active = resolveLanguages(window.location.search, readStored())
  return active
}

/** Persist + reload with ?langs= reflecting the choice (cleared when empty, the
 * default). The hash route survives the reload. */
export function switchLanguages(codes: string[]): void {
  const cleaned = clean(codes)
  try {
    if (cleaned.length) localStorage.setItem(STORAGE_KEY, cleaned.join(','))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked - the URL param still carries the choice
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('c') // retire the legacy param on any change
  if (cleaned.length) url.searchParams.set('langs', cleaned.join(','))
  else url.searchParams.delete('langs')
  window.location.href = url.toString()
}

let languagesCache: Promise<LanguageOption[]> | null = null

/** The corpus-filter manifest (>=100-film languages, cn+zh merged), sorted by
 * film count. Global (not per-language). */
export function getLanguages(): Promise<LanguageOption[]> {
  if (!languagesCache) languagesCache = fetchJSON<LanguageOption[]>('json/languages.json')
  return languagesCache
}

/** Localized language name, e.g. languageName('es','en') === 'Spanish'. Falls
 * back to the upper-cased code when Intl doesn't know it. */
export function languageName(code: string, locale?: string): string {
  try {
    const dn = new Intl.DisplayNames([locale ?? 'en'], { type: 'language' })
    return dn.of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/languages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/languages.ts app/src/lib/languages.test.ts
git commit -m "feat(app): languages selection module (resolve/active/switch + manifest + names)"
```

---

## Task 2: log-odds TS port

**Files:**
- Create: `app/src/lib/logOdds.ts`
- Test: `app/src/lib/logOdds.test.ts`

**Interfaces:**
- Produces: `logOdds(movie: Map<string, number>, corpus: Map<string, number>,
  opts?: { alpha0?: number; minCount?: number; nCorpus?: number }): [string, number][]`
  sorted by z descending. Mirrors `derive.py:log_odds` (alpha0=100, min_count=3).

- [ ] **Step 1: Write the failing test (values checked against the Python)**

Create `app/src/lib/logOdds.test.ts`. Compute expected values by running the
Python once: `cd pipeline && uv run python -c "from moviewords_pipeline.derive import log_odds; print(log_odds({'a':50,'b':10,'c':3},{'a':100,'b':900,'c':50,'d':8000}))"`
and paste the rounded outputs:

```ts
import { describe, expect, it } from 'vitest'
import { logOdds } from './logOdds'

describe('logOdds', () => {
  it('ranks over-represented words first and matches the Python reference', () => {
    const movie = new Map([['a', 50], ['b', 10], ['c', 3]])
    const corpus = new Map([['a', 100], ['b', 900], ['c', 50], ['d', 8000]])
    const out = logOdds(movie, corpus)
    // 'a' is hugely over-represented vs the corpus -> first
    expect(out[0][0]).toBe('a')
    // z-scores match derive.py:log_odds to 4 dp (paste real values here)
    const byWord = Object.fromEntries(out.map(([w, z]) => [w, Number(z.toFixed(4))]))
    expect(byWord.a).toBeCloseTo(/* PYTHON a */ 0, 4)  // replace 0 with printed value
    expect(byWord.b).toBeCloseTo(/* PYTHON b */ 0, 4)
    expect(byWord.c).toBeCloseTo(/* PYTHON c */ 0, 4)
  })
  it('skips words below minCount and words absent from the corpus', () => {
    const out = logOdds(new Map([['x', 2], ['y', 100]]), new Map([['y', 10]]))
    expect(out.map(([w]) => w)).toEqual(['y']) // x below minCount 3; y present
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/lib/logOdds.test.ts`
Expected: FAIL — cannot find module `./logOdds`.

- [ ] **Step 3: Write `logOdds.ts`**

Create `app/src/lib/logOdds.ts` (direct port of the Python):

```ts
/** Monroe et al. log-odds-ratio with an informative Dirichlet prior from corpus
 * frequencies. Port of pipeline derive.py:log_odds - keep in sync. Returns
 * [word, z] sorted by z descending (most over-represented first). */
export function logOdds(
  movie: Map<string, number>,
  corpus: Map<string, number>,
  opts: { alpha0?: number; minCount?: number; nCorpus?: number } = {},
): [string, number][] {
  const alpha0 = opts.alpha0 ?? 100
  const minCount = opts.minCount ?? 3
  const nMovie = [...movie.values()].reduce((a, b) => a + b, 0)
  const nCorpus = opts.nCorpus ?? [...corpus.values()].reduce((a, b) => a + b, 0)
  const out: [string, number][] = []
  for (const [word, y] of movie) {
    if (y < minCount) continue
    const yC = corpus.get(word) ?? 0
    const prior = nCorpus ? (alpha0 * yC) / nCorpus : 0
    if (prior === 0) continue
    const delta =
      Math.log((y + prior) / (nMovie + alpha0 - y - prior)) -
      Math.log((yC + prior) / (nCorpus + alpha0 - yC - prior))
    const variance = 1 / (y + prior) + 1 / (yC + prior)
    out.push([word, delta / Math.sqrt(variance)])
  }
  return out.sort((a, b) => b[1] - a[1])
}
```

- [ ] **Step 4: Fill in the real Python values, run to verify it passes**

Replace the `/* PYTHON */` placeholders with the printed z-scores, then:
Run: `cd app && npx vitest run src/lib/logOdds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/logOdds.ts app/src/lib/logOdds.test.ts
git commit -m "feat(app): TS port of the log-odds signature math (matches pipeline)"
```

---

## Task 3: Merge helpers

**Files:**
- Create: `app/src/lib/merge.ts`
- Test: `app/src/lib/merge.test.ts`

**Interfaces:**
- Consumes: `logOdds` (Task 2); types `Leaderboard`, `SignatureEntry`,
  `Superlatives`, `WonderRow`, `UbiquityRow`, `Shifts` from `data.ts`.
- Produces:
  - `mergeWordRows<T extends [string, number, number, ...unknown[]]>(parts: T[][], topN: number): T[]`
    — sum col[1] (count) + col[2] (movie_count) by word (col[0]); keep the
    remaining columns from the first occurrence; re-sort by count desc; slice topN.
  - `mergeLeaderboard(parts: Leaderboard[]): Leaderboard`
  - `mergeSignatures(parts: Record<string, SignatureEntry>[]): Record<string, SignatureEntry>`
  - `mergeSuperlatives(parts: Superlatives[]): Superlatives`
  - `mergeWonders(parts: WonderRow[][]): WonderRow[]`
  - `mergeUbiquity(parts: UbiquityRow[][]): UbiquityRow[]`
  - `mergeShifts(parts: Shifts[]): Shifts`
  - `mergeYearTotals(parts: Map<number, number>[]): Map<number, number>`
  - `mergeTrendLines(parts: [number, number][][]): [number, number][]`
  - `mergeTopFilms<T extends { count: number }>(parts: T[][], topN: number): T[]`

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  mergeWordRows, mergeYearTotals, mergeTrendLines, mergeSuperlatives, mergeSignatures,
} from './merge'

describe('mergeWordRows', () => {
  it('sums count + movie_count by word and re-sorts', () => {
    const es = [['amor', 100, 3, 4.1, 'n', 'n'], ['gato', 40, 2, 3.0, 'n', 'n']]
    const fr = [['amor', 60, 2, 4.1, 'n', 'n'], ['chat', 90, 3, 3.2, 'n', 'n']]
    const out = mergeWordRows([es, fr] as never, 10)
    expect(out[0]).toEqual(['amor', 160, 5, 4.1, 'n', 'n'])
    expect(out.map((r) => r[0])).toEqual(['amor', 'chat', 'gato'])
  })
})

describe('mergeYearTotals', () => {
  it('sums per-year totals across languages', () => {
    const a = new Map([[2000, 100], [2001, 50]])
    const b = new Map([[2001, 30], [2002, 10]])
    expect([...mergeYearTotals([a, b]).entries()].sort()).toEqual([[2000, 100], [2001, 80], [2002, 10]])
  })
})

describe('mergeTrendLines', () => {
  it('sums per-year counts (exact), ascending', () => {
    expect(mergeTrendLines([[[2000, 5], [2001, 3]], [[2001, 4], [2002, 1]]]))
      .toEqual([[2000, 5], [2001, 7], [2002, 1]])
  })
})

describe('mergeSuperlatives', () => {
  it('concatenates + re-ranks each category by value desc', () => {
    const a = { chattiest: [{ id: '1', title: 'A', year: 2000, value: 9 }], vocabulary: [], sweariest: [], repetitive: [] }
    const b = { chattiest: [{ id: '2', title: 'B', year: 2001, value: 12 }], vocabulary: [], sweariest: [], repetitive: [] }
    const out = mergeSuperlatives([a, b])
    expect(out.chattiest.map((f) => f.id)).toEqual(['2', '1'])
  })
})

describe('mergeSignatures', () => {
  it('sums entity counts and recomputes a head-accurate signature', () => {
    const a = { '2000': { movie_count: 2, total_words: 200, top: [['amor', 120], ['casa', 40]] as [string, number][], signature: [] } }
    const b = { '2000': { movie_count: 3, total_words: 300, top: [['amor', 80], ['mar', 60]] as [string, number][], signature: [] } }
    const out = mergeSignatures([a, b])
    expect(out['2000'].movie_count).toBe(5)
    expect(out['2000'].total_words).toBe(500)
    // 'amor' count summed in the merged top
    expect(out['2000'].top.find((t) => t[0] === 'amor')?.[1]).toBe(200)
    expect(out['2000'].signature.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/lib/merge.test.ts`
Expected: FAIL — cannot find module `./merge`.

- [ ] **Step 3: Write `merge.ts`**

Create `app/src/lib/merge.ts`:

```ts
import { logOdds } from './logOdds'
import type {
  Leaderboard, SignatureEntry, Superlatives, WonderRow, UbiquityRow, Shifts, FilmSuperlative,
} from './data'

/** Sum count (col 1) + movie_count (col 2) by word (col 0) across slices;
 * keep later columns (meta) from the first sighting; re-sort by count desc. */
export function mergeWordRows<T extends [string, number, number, ...unknown[]]>(
  parts: T[][], topN: number,
): T[] {
  const by = new Map<string, T>()
  for (const rows of parts) {
    for (const row of rows) {
      const cur = by.get(row[0])
      if (!cur) by.set(row[0], [...row] as T)
      else { cur[1] += row[1]; cur[2] += row[2] }
    }
  }
  return [...by.values()].sort((a, b) => b[1] - a[1]).slice(0, topN)
}

export function mergeLeaderboard(parts: Leaderboard[]): Leaderboard {
  return {
    words: mergeWordRows(parts.map((p) => p.words), 1000),
    stopwords: mergeWordRows(parts.map((p) => p.stopwords), 50),
  }
}

export function mergeYearTotals(parts: Map<number, number>[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const m of parts) for (const [y, t] of m) out.set(y, (out.get(y) ?? 0) + t)
  return out
}

export function mergeTrendLines(parts: [number, number][][]): [number, number][] {
  const out = new Map<number, number>()
  for (const line of parts) for (const [y, c] of line) out.set(y, (out.get(y) ?? 0) + c)
  return [...out.entries()].sort((a, b) => a[0] - b[0])
}

export function mergeTopFilms<T extends { count: number }>(parts: T[][], topN: number): T[] {
  return parts.flat().sort((a, b) => b.count - a.count).slice(0, topN)
}

const rankFilms = (parts: FilmSuperlative[][], topN = 20): FilmSuperlative[] =>
  parts.flat().sort((a, b) => b.value - a.value).slice(0, topN)

export function mergeSuperlatives(parts: Superlatives[]): Superlatives {
  return {
    chattiest: rankFilms(parts.map((p) => p.chattiest)),
    vocabulary: rankFilms(parts.map((p) => p.vocabulary)),
    sweariest: rankFilms(parts.map((p) => p.sweariest)),
    repetitive: rankFilms(parts.map((p) => p.repetitive)),
  }
}

export function mergeWonders(parts: WonderRow[][]): WonderRow[] {
  // one-film wonders are per-film facts; union then re-rank by share desc
  return parts.flat().sort((a, b) => b.share - a.share).slice(0, 50)
}

export function mergeUbiquity(parts: UbiquityRow[][]): UbiquityRow[] {
  // ubiquity = films-appeared / total; sum films, keep max share (head-accurate)
  const by = new Map<string, UbiquityRow>()
  for (const rows of parts) for (const r of rows) {
    const cur = by.get(r.word)
    if (!cur) by.set(r.word, { ...r })
    else { cur.films += r.films; cur.share = Math.max(cur.share, r.share) }
  }
  return [...by.values()].sort((a, b) => b.films - a.films).slice(0, 200)
}

export function mergeShifts(parts: Shifts[]): Shifts {
  // rate-delta board: single-language is exact; multi-language unions the
  // risers/fallers and re-ranks by the pre-computed score (head-accurate).
  const decades = [...new Set(parts.flatMap((p) => p.decades))].sort((a, b) => a - b)
  const top = (key: 'risers' | 'fallers') =>
    parts.flatMap((p) => p[key]).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 30)
  return { decades, risers: top('risers'), fallers: top('fallers') }
}

export function mergeSignatures(
  parts: Record<string, SignatureEntry>[],
): Record<string, SignatureEntry> {
  const keys = new Set(parts.flatMap((p) => Object.keys(p)))
  const out: Record<string, SignatureEntry> = {}
  // reference corpus for the recompute: the summed top-word counts across every
  // entity in every slice (head-accurate - see spec's multi-select decision)
  const corpus = new Map<string, number>()
  for (const p of parts) for (const e of Object.values(p))
    for (const [w, c] of e.top) corpus.set(w, (corpus.get(w) ?? 0) + c)
  for (const key of keys) {
    const entries = parts.map((p) => p[key]).filter(Boolean)
    const top = new Map<string, number>()
    for (const e of entries) for (const [w, c] of e.top) top.set(w, (top.get(w) ?? 0) + c)
    const topArr = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100) as [string, number][]
    out[key] = {
      movie_count: entries.reduce((s, e) => s + e.movie_count, 0),
      total_words: entries.reduce((s, e) => s + e.total_words, 0),
      top: topArr,
      signature: logOdds(top, corpus, { minCount: 20 }).slice(0, 100)
        .map(([w, z]) => [w, Number(z.toFixed(2))]) as [string, number][],
    }
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/lib/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/merge.ts app/src/lib/merge.test.ts
git commit -m "feat(app): client-side merge helpers for per-language slices"
```

---

## Task 4: Language-aware JSON data layer

**Files:**
- Modify: `app/src/lib/data.ts` (`dataUrl` L8, `fetchJSON` L48-58, the aggregate
  getters L113-124)
- Test: `app/src/lib/data.test.ts` (new)

**Interfaces:**
- Consumes: `activeLanguages` (Task 1), merge helpers (Task 3).
- Produces:
  - `globalUrl(path): string` = `${DATA_BASE}/all/${path}` (the unfiltered tree).
  - `langUrl(code, path): string` = `${DATA_BASE}/all/lang/${code}/${path}`.
  - `fetchLangMerged<T>(path: string, merge: (parts: T[]) => T): Promise<T>` —
    0 langs → `fetchJSON(path)` (global); 1 → that slice; 2+ → fetch all + merge.
  - `getFilteredMovieIndex(): Promise<MovieIndexEntry[]>` — global index filtered
    to `activeLanguages()` (empty = all).
  - Aggregate getters (`getLeaderboard`, `getSignatures`, `getShifts`,
    `getSuperlatives`, `getWonders`, `getUbiquity`) become language-aware.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/data.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); localStorage.clear() })

async function withLangs(langs: string[]) {
  if (langs.length) localStorage.setItem('langs', langs.join(','))
  return await import('./data')
}

describe('fetchLangMerged', () => {
  it('0 languages fetches the global all/ file, no merge', async () => {
    const data = await withLangs([])
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ v: 1 })))
    const out = await data.fetchLangMerged<{ v: number }>('json/x.json', (ps) => ps[0])
    expect(out).toEqual({ v: 1 })
    expect(spy.mock.calls[0][0]).toContain('/all/json/x.json')
  })

  it('2 languages fetch both slices and merge', async () => {
    const data = await withLangs(['es', 'fr'])
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) =>
      Promise.resolve(new Response(JSON.stringify({ v: String(u).includes('/es/') ? 1 : 2 }))))
    const out = await data.fetchLangMerged<{ v: number }>(
      'json/x.json', (ps) => ({ v: ps.reduce((s, p) => s + p.v, 0) }))
    expect(out).toEqual({ v: 3 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/lib/data.test.ts`
Expected: FAIL — `fetchLangMerged` not exported.

- [ ] **Step 3: Rewire `data.ts`**

Replace the `dataUrl` line and add the merge funnel. In `app/src/lib/data.ts`:

```ts
import { activeLanguages } from './languages'
import {
  mergeLeaderboard, mergeSignatures, mergeShifts, mergeSuperlatives,
  mergeWonders, mergeUbiquity,
} from './merge'

export const DATA_BASE =
  import.meta.env.VITE_DATA_BASE ?? 'https://data.moviewords.org'

/** The unfiltered corpus tree (also the base for per-language slices). */
export const globalUrl = (path: string) => `${DATA_BASE}/all/${path}`
export const langUrl = (code: string, path: string) => `${DATA_BASE}/all/lang/${code}/${path}`

// Back-compat shim for callers still importing dataUrl (movie/index/wordlists,
// duck.ts parquet reads): the global all/ tree.
export const dataUrl = (path: string) => globalUrl(path)
```

Keep `fetchJSON` but make it fetch an absolute-or-global URL. Change its body to
accept a full path under the global tree (unchanged signature). Then add:

```ts
function fetchOne<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
      return res.json()
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url) as Promise<T>
}

/** Language-aware aggregate fetch. 0 languages -> the global all/ file; 1 -> that
 * slice (exact); 2+ -> fetch every selected slice and merge. */
export function fetchLangMerged<T>(path: string, merge: (parts: T[]) => T): Promise<T> {
  const langs = activeLanguages()
  if (langs.length === 0) return fetchOne<T>(globalUrl(path))
  return Promise.all(langs.map((c) => fetchOne<T>(langUrl(c, path)))).then((parts) =>
    parts.length === 1 ? parts[0] : merge(parts),
  )
}
```

(Refactor `fetchJSON` to call `fetchOne(globalUrl(path))` so both share the
cache.) Rewire the aggregate getters:

```ts
export const getShifts = () => fetchLangMerged<Shifts>('json/leaderboards/shifts.json', mergeShifts)
export const getSuperlatives = () => fetchLangMerged<Superlatives>('json/leaderboards/films.json', mergeSuperlatives)
export const getWonders = () => fetchLangMerged<WonderRow[]>('json/leaderboards/wonders.json', mergeWonders)
export const getUbiquity = () => fetchLangMerged<UbiquityRow[]>('json/leaderboards/everywhere.json', mergeUbiquity)
export const getSignatures = (kind: 'decades' | 'genres') =>
  fetchLangMerged<Record<string, SignatureEntry>>(`json/signature/${kind}.json`, mergeSignatures)
export const getLeaderboard = () => fetchLangMerged<Leaderboard>('json/leaderboard-default.json', mergeLeaderboard)

// global (never per-language):
export const getMovieIndex = () => fetchJSON<MovieIndexEntry[]>('json/movies-index.json')
export const getMovie = (id: string) => fetchJSON<MovieDetail>(`json/movie/${id}.json`)
export const getWordlists = () => fetchJSON<Wordlists>('json/wordlists.json')

/** The movie index filtered to the active language selection (empty = all). */
export async function getFilteredMovieIndex(): Promise<MovieIndexEntry[]> {
  const [idx, langs] = [await getMovieIndex(), activeLanguages()]
  if (langs.length === 0) return idx
  const set = new Set(langs.includes('zh') ? [...langs, 'cn'] : langs)
  return idx.filter((m) => m.lang != null && set.has(m.lang))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/lib/data.test.ts && npx vitest run`
Expected: PASS (new + full suite).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/data.ts app/src/lib/data.test.ts
git commit -m "feat(app): language-aware JSON getters via fetchLangMerged + filtered movie index"
```

---

## Task 5: Language-aware trends + featured + engine filter

**Files:**
- Modify: `app/src/lib/series.ts` (bakedYearTotals L83-88, fetchTrendFile L93-98,
  loadTrends L104-127, loadFeaturedSeries L50-67, loadTrendsEngine/loadWordSeries)
- Modify: `app/src/lib/duck.ts` (add `langFilterSql`)
- Test: `app/src/lib/series.test.ts` (new — the pure merge, not network)

**Interfaces:**
- Consumes: `activeLanguages`, merge helpers, `langUrl`/`globalUrl`.
- Produces: `langFilterSql(alias?: string): string` in `duck.ts` — returns
  `` or ` AND m.original_language IN ('es','fr')` for the active selection
  (expands `zh`→`zh,cn`), for the engine fallbacks.

- [ ] **Step 1: Write the failing test (pure merge path)**

Create `app/src/lib/series.test.ts` covering the trend-file merge helper you'll
extract:

```ts
import { describe, expect, it } from 'vitest'
import { mergeTrendFiles } from './series'
import type { TrendFile } from './trends'

describe('mergeTrendFiles', () => {
  it('sums line counts exactly and unions top films', () => {
    const es: TrendFile = { line: [[2000, 5], [2001, 3]], top: [['tt_es', 'A', 2000, 5, 900]], byYear: [] }
    const fr: TrendFile = { line: [[2001, 4]], top: [['tt_fr', 'B', 2001, 4, 800]], byYear: [] }
    const out = mergeTrendFiles([es, fr])
    expect(out.line).toEqual([[2000, 5], [2001, 7]])
    expect(out.top.map((t) => t[0])).toEqual(['tt_es', 'tt_fr']) // count desc
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/lib/series.test.ts`
Expected: FAIL — `mergeTrendFiles` not exported.

- [ ] **Step 3: Add `langFilterSql`, `mergeTrendFiles`, and rewire series.ts**

In `app/src/lib/duck.ts` add:

```ts
import { activeLanguages } from './languages'

/** ` AND <alias>.original_language IN (...)` for the active selection, or '' when
 * nothing is selected. Expands the merged Chinese option to both TMDB codes. */
export function langFilterSql(alias = 'm'): string {
  const langs = activeLanguages()
  if (!langs.length) return ''
  const codes = langs.includes('zh') ? [...langs, 'cn'] : langs
  return ` AND ${alias}.original_language IN (${codes.map(lit).join(',')})`
}
```

In `app/src/lib/series.ts`:

```ts
import { activeLanguages } from './languages'
import { langUrl, globalUrl } from './data'
import { mergeTrendLines, mergeTopFilms, mergeYearTotals } from './merge'

/** Merge per-language TrendFiles: line summed exactly, top/byYear unioned and
 * re-ranked. */
export function mergeTrendFiles(parts: TrendFile[]): TrendFile {
  const top = mergeTopFilms(
    parts.flatMap((p) => p.top).map((t) => ({ t, count: t[3] })), 15,
  ).map((x) => x.t)
  const byYear = new Map<number, TrendFile['byYear'][number]>()
  for (const p of parts) for (const r of p.byYear) {
    const cur = byYear.get(r[0])
    if (!cur || r[3] > cur[3]) byYear.set(r[0], r)
  }
  return {
    line: mergeTrendLines(parts.map((p) => p.line)),
    top,
    byYear: [...byYear.values()].sort((a, b) => a[0] - b[0]),
  }
}
```

- `bakedYearTotals`: when languages are selected, fetch each
  `langUrl(code, 'json/year-totals.json')`, parse to `Map`, and
  `mergeYearTotals`; else fetch `globalUrl('json/year-totals.json')` as today.
- `fetchTrendFile(word)`: fetch per selected language
  (`langUrl(code, json/trend/<key>.json)`); a language returning 404 contributes
  nothing; if ALL are 404 return `null` ("not enough data"); otherwise
  `mergeTrendFiles` the non-404 parts. 0 languages → the global path as today.
- `loadTrendsEngine`/`loadWordSeries` (fallbacks): append `langFilterSql('m')`
  to the `movies m` joins so the engine path is also language-scoped.
- `loadFeaturedSeries`: same per-language fetch+merge of `featured-series.json`
  (sum `totals` and each word's `[year,count]` via `mergeTrendLines`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/lib/series.test.ts && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/series.ts app/src/lib/duck.ts app/src/lib/series.test.ts
git commit -m "feat(app): language-aware trends/featured merge + engine-path lang filter"
```

---

## Task 6: Direct-engine views gain the language filter

**Files:**
- Modify: `app/src/views/Leaderboard.tsx:132-142` (filtered words query)
- Modify: `app/src/views/Compare.tsx:85-90` (`useSwears` query)

**Interfaces:**
- Consumes: `langFilterSql` (Task 5).

- [ ] **Step 1: Add the filter to the Leaderboard engine query**

In `app/src/views/Leaderboard.tsx`, import `langFilterSql` from `../lib/duck`
and inject it into the `WHERE` of the L132-142 query, e.g. after the
`m.year BETWEEN …` predicate: `... ${langFilterSql('m')} ...`. (The query already
joins `movies m`.)

- [ ] **Step 2: Add the filter to Compare's useSwears query**

In `app/src/views/Compare.tsx` (`useSwears`, L85-90), the query is over
`words_by_movie` by `imdb_id IN (...)` — those ids already come from
language-filtered cards, so no change is needed to correctness, BUT confirm the
compared entity picker (`EntityPicker`, decades/genres via `getSignatures`) shows
language-merged signatures (it will, via Task 4). No engine change required here;
document that in the commit.

- [ ] **Step 3: Verify build + tests**

Run: `cd app && npm run build && npx vitest run`
Expected: build clean, tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/views/Leaderboard.tsx app/src/views/Compare.tsx
git commit -m "feat(app): language-filter the Leaderboard filtered query"
```

---

## Task 7: Multiselect language dropdown

**Files:**
- Modify: `app/src/App.tsx` (replace `CorpusDropdown` L66-... with `LanguageFilter`;
  update the import L4 and usage)
- Modify: `app/src/components/ui.tsx:118` (LangBadge guard uses `activeLanguages`)

**Interfaces:**
- Consumes: `activeLanguages`, `switchLanguages`, `getLanguages`, `languageName`
  (Task 1).

- [ ] **Step 1: Replace the corpus import and dropdown**

In `app/src/App.tsx` replace the `./lib/corpus` import with:

```ts
import { activeLanguages, switchLanguages, getLanguages, languageName, type LanguageOption } from './lib/languages'
```

- [ ] **Step 2: Implement `LanguageFilter`**

Replace `CorpusDropdown` with a multiselect (builds on the shipped dropdown's
open/close/Escape logic). Complete component:

```tsx
function LanguageFilter() {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<LanguageOption[]>([])
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<string[]>(() => activeLanguages())
  const ref = useRef<HTMLDivElement>(null)
  const active = activeLanguages()

  useEffect(() => { getLanguages().then(setOpts).catch(() => setOpts([])) }, [])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const label = active.length === 0 ? 'All films'
    : active.length === 1 ? languageName(active[0]) : `${active.length} languages`
  const filtered = opts.filter((o) =>
    !query || languageName(o.code).toLowerCase().includes(query.toLowerCase()) || o.code.includes(query.toLowerCase()))
  const toggle = (code: string) => setSel((s) => s.includes(code) ? s.filter((c) => c !== code) : [...s, code])
  const apply = () => switchLanguages(sel)
  const dirty = sel.join(',') !== active.join(',')

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label="Filter films by original language"
        className="flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-script text-sm font-bold uppercase hover:bg-mark">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18" />
          <path d="M12 3c2.6 2.7 3.9 5.9 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.9-3.9-9S9.4 5.7 12 3Z" />
        </svg>
        {label}
        <svg viewBox="0 0 24 24" className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="menu" aria-label="Original language" className="absolute right-0 z-20 mt-1 w-64 border-2 border-ink bg-paper font-script text-sm">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search languages…"
            className="w-full border-b-2 border-ink bg-transparent px-2.5 py-1.5 outline-none" aria-label="Search languages" />
          <button onClick={() => setSel([])} aria-pressed={sel.length === 0}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-bold uppercase ${sel.length === 0 ? 'bg-ink text-paper' : 'hover:bg-mark'}`}>
            <span aria-hidden="true" className="w-3">{sel.length === 0 ? '✓' : ''}</span> All films
          </button>
          <div className="max-h-72 overflow-auto">
            {filtered.map((o) => (
              <button key={o.code} onClick={() => toggle(o.code)} role="menuitemcheckbox" aria-checked={sel.includes(o.code)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left uppercase ${sel.includes(o.code) ? 'bg-mark' : 'hover:bg-mark'}`}>
                <span className="flex items-center gap-2"><span aria-hidden="true" className="w-3">{sel.includes(o.code) ? '✓' : ''}</span>{languageName(o.code)}</span>
                <span className="text-ink-2">{o.films.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <button onClick={apply} disabled={!dirty}
            className="w-full border-t-2 border-ink px-2.5 py-1.5 font-bold uppercase disabled:opacity-40 hover:bg-mark">Apply</button>
        </div>
      )}
    </div>
  )
}
```

Update the header usage (`<CorpusDropdown />` → `<LanguageFilter />`).

- [ ] **Step 3: Update LangBadge guard**

In `app/src/components/ui.tsx:118`, replace the `activeCorpus().id !== 'all'`
guard so the per-film language badge shows whenever the film's `lang` differs
from `en` and isn't filtered out. Minimal change:

```ts
import { activeLanguages } from '../lib/languages'
// show the badge for any non-English original whenever the corpus isn't
// restricted to a single language that already implies it
if (!lang || lang === 'en') return null
```

- [ ] **Step 4: Verify in browser (port 5173)**

Run: `cd app && npm run build && (npm run dev -- --port 5173 &)`; open
`http://localhost:5173/`, open the dropdown, search, tick two languages, Apply,
confirm reload + `?langs=` + the hero film count changes (Task 8 wires the count).

- [ ] **Step 5: Commit**

```bash
git add app/src/App.tsx app/src/components/ui.tsx
git commit -m "feat(app): multiselect original-language filter dropdown (search + counts + Apply)"
```

---

## Task 8: "Based on N films" labels + empty states

**Files:**
- Modify: `app/src/views/Home.tsx` (use `getFilteredMovieIndex` L55 so `count`
  reflects the selection; adjust the L123 wording)
- Modify: `app/src/views/Trends.tsx` (add a corpus-size label near L245)
- Modify: `app/src/views/Leaderboard.tsx` (board-level "based on N films")
- Modify: `app/src/views/{Decades,Genres}.tsx`, `app/src/views/Entity.tsx`
  (empty state when no entity clears the min-film floor for the selection)

**Interfaces:**
- Consumes: `getFilteredMovieIndex`, `activeLanguages`, `languageName`.

- [ ] **Step 1: Home count reflects the filter**

In `app/src/views/Home.tsx`, swap `getMovieIndex()` (L55) for
`getFilteredMovieIndex()` so `count`/`words` reflect the selection. Update the
L123 wording to name the languages when filtered, e.g.:

```tsx
{activeLanguages().length === 0
  ? (activeLanguages().length /* All */ , 'films - translated subtitles included')
  : `${activeLanguages().map((c) => languageName(c)).join(', ')}-language films`}
```

(Keep it a single hyphenated clause; no em-dashes.)

- [ ] **Step 2: Add a Trends corpus label + empty state**

In `app/src/views/Trends.tsx`, when `activeLanguages().length > 0`, render a
muted line "Based on {N} {language}-language films" using
`getFilteredMovieIndex().length`. When `wordSeries.series` is empty for the
selection, show "Not enough films in {languages} for this trend - add languages
or switch to All films".

- [ ] **Step 3: Board + entity empty states**

- Leaderboard word tables: add a muted "based on {N} films" derived from
  `getFilteredMovieIndex().length`.
- Decades/Genres/Entity: `getSignatures` merge already yields per-entity
  `movie_count`; when an entity's `movie_count` is 0 (filtered out) hide the card;
  when the whole map is empty show the shared empty message.

- [ ] **Step 4: Verify in browser (port 5173)**

Select a small language (e.g. Finnish), confirm Trends/Decades degrade to honest
"not enough data" states and every view shows the right film count.

- [ ] **Step 5: Commit**

```bash
git add app/src/views/Home.tsx app/src/views/Trends.tsx app/src/views/Leaderboard.tsx app/src/views/Decades.tsx app/src/views/Genres.tsx app/src/views/Entity.tsx
git commit -m "feat(app): honest 'based on N films' labels + degradation empty states"
```

---

## Task 9: Locale opt-in hint

**Files:**
- Create: `app/src/components/LocaleFilterHint.tsx`
- Modify: `app/src/App.tsx` (render the hint in the header/top of main)
- Test: `app/src/components/LocaleFilterHint.test.tsx` (pure logic: should-show)

**Interfaces:**
- Consumes: `activeLanguages`, `switchLanguages`, `getLanguages`, `languageName`.
- Produces: `shouldSuggest(locale: string, active: string[], options: string[],
  dismissed: boolean): string | null` — returns the language code to suggest, or
  null. Suggest when: locale's base language ≠ 'en', is in `options`, `active` is
  empty, and not `dismissed`.

- [ ] **Step 1: Write the failing test**

Create `app/src/components/LocaleFilterHint.test.tsx`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldSuggest } from './LocaleFilterHint'

describe('shouldSuggest', () => {
  const opts = ['fr', 'es', 'ja']
  it('suggests the locale language when eligible', () => {
    expect(shouldSuggest('es-ES', [], opts, false)).toBe('es')
  })
  it('does not suggest for English, when already filtered, when dismissed, or unlisted', () => {
    expect(shouldSuggest('en-US', [], opts, false)).toBeNull()
    expect(shouldSuggest('es-ES', ['fr'], opts, false)).toBeNull()
    expect(shouldSuggest('es-ES', [], opts, true)).toBeNull()
    expect(shouldSuggest('de-DE', [], opts, false)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/components/LocaleFilterHint.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `LocaleFilterHint.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { activeLanguages, switchLanguages, getLanguages, languageName } from '../lib/languages'

const DISMISS_KEY = 'langHintDismissed'

/** The locale language to suggest filtering to, or null. */
export function shouldSuggest(locale: string, active: string[], options: string[], dismissed: boolean): string | null {
  if (dismissed || active.length) return null
  const base = locale.split('-')[0].toLowerCase()
  if (base === 'en' || !options.includes(base)) return null
  return base
}

export function LocaleFilterHint() {
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* ignore */ }
    getLanguages().then((opts) => {
      const locale = navigator.language || 'en'
      setCode(shouldSuggest(locale, activeLanguages(), opts.map((o) => o.code), dismissed))
    }).catch(() => {})
  }, [])
  if (!code) return null
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }; setCode(null) }
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-2 border-ink bg-paper-2 px-3 py-2 text-sm">
      <span>Viewing in {languageName(code)}? Filter to {languageName(code)}-language films.</span>
      <span className="flex gap-2">
        <button onClick={() => switchLanguages([code])} className="border-2 border-ink px-2 py-0.5 font-script font-bold uppercase hover:bg-mark">Filter</button>
        <button onClick={dismiss} aria-label="Dismiss" className="px-1 font-bold">✕</button>
      </span>
    </div>
  )
}
```

Render `<LocaleFilterHint />` at the top of `<main>` in `App.tsx`.

- [ ] **Step 4: Run tests + build**

Run: `cd app && npx vitest run && npm run build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/LocaleFilterHint.tsx app/src/components/LocaleFilterHint.test.tsx app/src/App.tsx
git commit -m "feat(app): gentle locale-based filter suggestion (opt-in, dismissible)"
```

---

## Task 10: Full verification pass

- [ ] **Step 1: Whole suite + build + lint**

Run: `cd app && npx vitest run && npm run build && npm run lint`
Expected: tests pass; build clean; no NEW lint errors (the pre-existing
LineChart rules-of-hooks errors remain).

- [ ] **Step 2: Browser matrix on port 5173**

Drive `http://localhost:5173/`: (a) All films default; (b) single language exact
(Spanish) across Home/Leaderboard/Trends/Decades/Genres/Compare/Movie; (c) two
languages merged; (d) a small language degrades honestly; (e) `?langs=es,fr`
share link reproduces the view; (f) `?c=en`/`?c=all` back-compat.

- [ ] **Step 3: Commit any fixes, then it's ready to ship**

```bash
git add -A && git commit -m "test(app): full language-filter verification pass"
```

---

## Self-Review

**Spec coverage:** selection state + back-compat (Task 1); per-language merge for
leaderboard/boards/signatures/trends/featured (Tasks 3-5); exact single-language +
head-accurate multi (merge helpers); movie index filtered by `lang` (Task 4);
three engine surfaces language-filtered (Tasks 5-6); multiselect dropdown with
search + counts + Apply + `?langs=` (Task 7); honest "based on N films" +
degradation (Task 8); locale opt-in (Task 9); Chinese `zh`→`zh,cn` expansion in
`getFilteredMovieIndex`/`langFilterSql` (Tasks 4-5). Migration: `en` selection
now reads `all/lang/en/`; the root `en` bake is unused by the app after this and
can be retired server-side.

**Placeholders:** Task 2 leaves explicit `/* PYTHON */` slots to be filled from a
one-line command (values can't be hand-computed reliably) - this is a
deliberate, bounded lookup, not a hidden TODO. Task 8 Steps 1-3 describe concrete
edits at named line ranges with sample code.

**Type consistency:** `activeLanguages(): string[]`, `switchLanguages(codes)`,
`fetchLangMerged<T>(path, merge)`, `mergeWordRows/…`, `langFilterSql(alias)`,
`getFilteredMovieIndex()`, `mergeTrendFiles(parts)`, `shouldSuggest(...)` are used
consistently across tasks and match the getters they feed.
