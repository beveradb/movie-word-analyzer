# Movie page details + include/exclude word-type filters — design

**Date:** 2026-09-15
**Branch:** feat/sess-20260915-0301-movie-page-details
**Status:** approved (brainstorm)

## Goal

Three user-facing improvements to the movie page, plus the minimal data work to
support them:

1. **More movie detail** — a short plot blurb (tagline + overview), plus runtime
   and words-per-minute stats.
2. **Poster + IMDb rating link to IMDb** — the poster image and the IMDb-rating
   stat both link to `https://www.imdb.com/title/{imdb_id}/`.
3. **Include/exclude word-type filters** — the part-of-speech chips
   (nouns/verbs/adjectives/adverbs/names & other) rotate through
   **off → include → exclude → off** so a viewer can, e.g., *exclude* names.

And a **future-proofing** goal: while we are hitting TMDB anyway, fetch thorough
per-film metadata once and archive it, so future analyses/UX need no new
pipeline run.

## Constraints & context

- **No GCP VM, no recompute.** The heavy corpus pipeline must not re-run. The
  only new data work is fetching metadata TMDB already has and writing new,
  additive files. Runs locally (the `TMDB_API_KEY` is in the dev env).
- The currently-published `movie/{id}.json` is baked by the original full
  pipeline and includes `original_language`. The no-VM `rebuild_web_data.py`
  bake **drops** `original_language`, so re-baking every per-movie file to
  inject `overview` would regress fields and re-upload ~51k files. We avoid this
  entirely with a **sidecar** file instead of embedding.
- R2/Cloudflare upload creds are **not** in the dev env — Andrew runs the
  upload with his creds. Claude can run the TMDB *fetch* locally to generate and
  validate real files.

## Data design — TMDB metadata fetch (minimal pipeline, three tiers)

New script `pipeline/scripts/fetch_tmdb_meta.py` (supersedes the narrow
`tmdb.py` enrich for this purpose; `tmdb.py` stays for the existing
language/countries enrichment). One TMDB request per film:

```
GET /movie/{tmdb_id}?append_to_response=credits,keywords
```

`append_to_response` bundles credits + keywords into the **same** HTTP request —
no extra rate cost. The film's TMDB id comes from the existing
`/find/{imdb_id}` lookup (as `tmdb.py` already does), so the driver is the
published `movies-index.json` id list (~51.6k all-corpus / 25.5k en). At the
existing ~20 req/s throttle the full corpus completes in well under an hour.

### Tier 1 — raw cache (future-proof archive)

`data/work/tmdb_meta/{imdb_id}.json` — the **full** TMDB detail response
(including appended `credits` + `keywords`), written atomically, resumable via
file-exists skip, `null` cached for no-match. Any field we did not parse into
tiers 2/3 is still on disk here, so future needs never require a re-fetch. This
directory is archived alongside the other pipeline caches.

### Tier 2 — consolidated `tmdb_meta.parquet` (analysis-ready)

Built from the tier-1 cache into flat columns, archived alongside the other
parquets and usable directly in DuckDB for future leaderboards/comparisons.
Columns (one row per film):

- Identity: `imdb_id`, `tmdb_id`, `original_title`
- Descriptive: `overview`, `tagline`, `runtime`, `release_date`, `status`,
  `homepage`, `adult`
- Franchise: `collection_id`, `collection_name` (from `belongs_to_collection`)
- Financial: `budget`, `revenue`
- TMDB signals: `tmdb_popularity`, `tmdb_vote_average`, `tmdb_vote_count`
- Taxonomy (list columns): `tmdb_genres`, `keywords`, `spoken_languages`,
  `production_countries`, `production_companies`
- People (**full credits**): `director` (list), `writers` (list), `composer`,
  `cinematographer`, `producers` (list), and `cast` — top ~20 billed as
  `[{name, character, order}]`.

### Tier 3 — app sidecar `json/blurb/{imdb_id}.json`

The tiny subset the movie page renders today, derived from tier 1/2:

```json
{ "overview": "…", "tagline": "…", "runtime": 117 }
```

Absent/empty fields simply omitted. This is what the frontend fetches per page.

### Publish

- Additive upload of `all/json/blurb/**` (and the mirrored per-language prefixes
  are **not** needed — blurbs are global, keyed by imdb_id, fetched from the
  global `all/` tree like `movies-index.json` and `movie/{id}.json`).
- `tmdb_meta.parquet` archived; publishing it to R2 is optional/future (no app
  consumer yet).
- `upload_r2.sh` gains a Cache-Control rule for `json/blurb/**` (24h is fine;
  blurbs are static once fetched).

## Frontend design

### `lib/data.ts`

- `MovieBlurb` interface `{ overview?: string; tagline?: string; runtime?: number }`.
- `getMovieBlurb(id)` → fetches `json/blurb/{id}.json` via the existing
  `fetchJSON` cache, but **404-tolerant**: a missing file resolves to `null`
  rather than throwing (the movie page must render fine without a blurb). Use a
  dedicated fetch that treats non-OK as `null` instead of `fetchJSON` (which
  throws on non-200) — the shared in-flight cache still applies.

### `views/Movie.tsx`

- Fetch the blurb in parallel with the movie; never block render on it. New
  `blurb` state, set independently.
- **Blurb block** below the header / above the filter bar: tagline (italic,
  smaller) when present, then the overview paragraph. The whole block is hidden
  when both are absent.
- **Poster → IMDb**: change the poster's wrapping `<a>` from the decade link to
  `https://www.imdb.com/title/{imdb_id}/`, `target="_blank"`,
  `rel="noopener noreferrer"`, with an appropriate `title`. The **decade link
  moves to the header year** text (the "- 2001" in the slug becomes a link to
  `/#/decade/2000`).
- **IMDb rating stat → IMDb**: the rating tile becomes a link to the same IMDb
  URL (extend `Stat` to accept an optional `href`, or wrap the tile). Opens in a
  new tab like the poster.
- **Runtime + words/min stats**: grow the stat grid from 4 to 6 tiles.
  - `Runtime` — `{runtime} min` from the blurb sidecar; shows `—` when absent.
  - `Words per minute` — `stats.words_per_minute` (already baked), rounded;
    shows `—` when null.
  - Grid becomes `grid-cols-2` × 3 rows (or `sm:grid-cols-3`); keep it tidy on
    mobile.

### `components/WordFilter.tsx` — tri-state POS chips

- `WordFilterState.pos` changes from `Set<string>` to
  `Map<string, 'include' | 'exclude'>`. `defaultFilter()` → empty map.
- Chip click rotates **off → include → exclude → off**:
  - not in map → set `'include'`
  - `'include'` → set `'exclude'`
  - `'exclude'` → delete (off)
- `passesFilter` semantics (include + exclude compose):
  - Let `includes` = keys mapped to `'include'`, `excludes` = keys mapped to
    `'exclude'`.
  - If `rowPos(row)` ∈ `excludes` → **fail**.
  - If `includes` is non-empty and `rowPos(row)` ∉ `includes` → **fail**.
  - Else pass. (Exclude always removes; include, when any set, restricts to the
    included kinds. A kind can't be both, by construction.)
- **"any kind"** button clears the whole map (active/highlighted when the map is
  empty).
- Visual states:
  - include → current `bg-mark` highlight + bold.
  - exclude → greyed + line-through label with a leading `−`, distinct border
    (e.g. `border-ink-3 text-ink-3 line-through`).
  - off → plain (`hover:bg-mark`).
  - `aria-pressed` is insufficient for tri-state; use `aria-label` describing
    the state, e.g. `"nouns: excluded (click to reset)"`.
- Hint line updates to describe both directions, e.g.
  `· only nouns, verbs` and/or `· hiding names & other`.
- Callers: `Movie.tsx` is the only consumer of `WordFilterBar`/`defaultFilter`
  today; the `common: 'all'` override for distinctive words
  (`{ ...filter, common: 'all' }`) still works since `pos` is untouched there.

## Testing

- `components/WordFilter.test.ts`: extend for
  - rotation off→include→exclude→off per chip,
  - `passesFilter` with includes only, excludes only, and both composed,
  - "any kind" reset.
- `lib/data.test.ts` (or a new small test): `getMovieBlurb` returns `null` on a
  404 and the parsed object on 200.
- Pipeline: a unit test for the tier-1→tier-3 record shaping in
  `fetch_tmdb_meta.py` (given a sample TMDB payload, assert the parquet row and
  the sidecar `{overview, tagline, runtime}`), without network.
- Manual: run the fetch for a small sample locally, point the app at local data
  (or a few generated files), verify the blurb block, IMDb links, and tri-state
  filters in the browser.

## Rollout / ship split

- **PR** carries: `fetch_tmdb_meta.py`, `upload_r2.sh` cache rule, the frontend
  changes, and tests. Frontend degrades gracefully with no blurb files present,
  so it is safe to merge/deploy before the data job finishes.
- **Data job** (Andrew, with creds): run `fetch_tmdb_meta.py` over the corpus →
  archive tier-1 + tier-2 → `upload_r2.sh` the `json/blurb/**` prefix. Claude
  can run the *fetch* to generate/validate real sample files first.

## Out of scope (future, unlocked by the archive)

Franchise/collection comparisons, cast/crew and keyword analyses,
budget-vs-vocabulary or runtime-vs-vocabulary leaderboards, TMDB-vs-IMDb rating
comparisons. All derivable later from `tmdb_meta.parquet` with no new fetch.
