# Dual-corpus moviewords: English originals + All films, votes >= 300

**Date:** 2026-09-14
**Status:** approved
**Goal:** publish the already-counted non-English-original films as a labeled
site-wide corpus toggle, and lower the vote floor from 1000 to 300 - grow the
corpus substantially without letting straight-to-video noise in.

## Background

The live site (moviewords.org) publishes 18,761 English-original films. The
pipeline counted 33,380 films; ~14.6k non-English originals were excluded at
one WHERE clause in `derive.py` (translated subtitles measure translators, not
screenwriters). Their word counts and TMDB metadata are cached on the GCP VM
`moviewords-pipeline-tmp` (nomadkaraoke, us-central1-a), which is RUNNING and
intact: 34GB OPUS zip, 33,380 count caches, 33,390 TMDB caches, 150GB free.
GCP credits expire ~2026-09-19 - VM work must happen before then.

## Corpus definitions

- **`en` corpus (default, semantics unchanged):** IMDb `titleType=movie`,
  `numVotes >= 300` (was 1000), subtitle matched in OPUS en, TMDB
  `original_language == 'en'`.
- **`all` corpus (new):** the same cut without the language filter - every
  counted film, labeled "All films - translated subtitles included".
- Both share posters (keyed by imdb_id) and methodology. Each corpus is
  internally consistent: signature/log-odds baselines, word_meta, boards and
  trends are computed within the selected corpus only.

## Vote threshold: 300 (data-driven)

Measured on the VM against current IMDb dumps + the actual OPUS zip:

| votes band | IMDb movies | with OPUS subs | coverage | median rating |
|---|---|---|---|---|
| 1000-2000 | 15,845 | 11,735 | 74% | 6.2 |
| 750-1000 | 8,141 | 5,378 | 66% | 6.1 |
| 500-750 | 13,462 | 8,045 | 60% | 6.0 |
| 300-500 | 20,125 | 10,168 | 50% | 5.9 |
| 200-300 | 18,602 | 7,581 | 41% | 5.8 |
| 100-200 | 37,366 | 10,953 | 29% | 5.8 |

Cumulative OPUS-covered candidates: >=1000 -> 41k, >=500 -> 55k, >=300 ->
65k, >=100 -> 83k (counted output is ~80% of candidates after subtitle
plausibility-band selection and TMDB matching).

Rationale for 300:
1. Title spot-checks: 300-500 samples as clean as 500-1000 (older Hollywood,
   world cinema, festival titles); junk rises visibly only below 300.
2. The OPUS-match requirement is itself a junk filter - a film enters only if
   someone bothered to subtitle and share it.
3. IMDb votes are Anglosphere-skewed; a high floor disproportionately excludes
   non-English hits, the very films this extension is about.
4. Below 300, coverage collapses (29-41%) and bucket size pushes toward the
   R2 free-tier ceiling.

Expected scale: ~52k counted films total; `en` corpus ~26-28k, `all` ~50k.
Junk guard: `boards.film_superlatives` gains a `votes >= 1000` eligibility
floor so corpus-wide superlative boards stay curated. Other surfaces keep
their existing guards (pos/zipf quality filter, >=3-film entity floor).

## Data layout: parallel artifacts under `all/`

The bucket gains an `all/` prefix mirroring the root layout exactly:
`movies.parquet`, `words_by_movie/data.parquet`, `words_by_word/data.parquet`,
`word_year.parquet`, `word_meta.parquet`, `json/...` (movie pages,
leaderboard-default, leaderboards/, signature/, movies-index, wordlists,
featured-series). Root artifacts are overwritten in place (the en corpus
legitimately changes: new >=300-vote films + refreshed IMDb ratings).

The two parquet sort orders (`(imdb_id, count DESC)` and `(word, imdb_id)`)
are load-bearing and preserved per corpus.

Rejected alternative: merged parquets + flag column - would touch every app
SQL query, complicate trends, and still require dual pre-baked JSONs.

## Original-language support (enables future analyses)

- `original_language` (ISO 639-1 string, never a boolean) carried through the
  whole `all` corpus: `movies.parquet` column, `movies-index.json` field, and
  each `json/movie/<id>.json` payload.
- New artifact `all/word_year_lang.parquet`: `(word, year, lang, count,
  movie_count)`, keeping a `(word, lang)` pair only when its corpus-wide
  total is >= 20 (the analogue of word_year's per-word floor) - per-language
  trends later are a direct scan, no rerun and no browser-side mega-join.
- Any other language slice remains possible in the browser:
  `JOIN movies USING (imdb_id) WHERE original_language = 'xx'` over the
  sorted parquets.

## Pipeline changes

- `config.py`: `MIN_VOTES = 300`.
- `derive.py`: parameterized `run(corpus)`; `corpus='en'` applies the
  language filter and writes to `data/out/`, `corpus='all'` skips it and
  writes to `data/out/all/` (plus `word_year_lang.parquet` and
  `original_language` propagation). CLI: `derive --corpus en|all`.
- `scripts/build_movies_index.py` (new): replaces the README heredoc; takes
  `--corpus`, includes `original_language` for `all`.
- `scripts/rebuild_web_data.py`: gains `--corpus` (IN/OUT suffixed `all/`);
  boards, extended signatures, meta and featured bake run per corpus.
- `boards.film_superlatives`: `votes >= 1000` eligibility floor.
- `fetch_posters.py`, count and enrich stages: unchanged (per-movie caches
  make reruns incremental; posters fetched for the union).

## Execution plan (on the VM, before ~2026-09-19)

1. Merge the code changes, `git pull` on the VM; re-download fresh IMDb
   basics/ratings (caches keyed by imdb_id stay valid).
2. `curate` (>=300) -> `index` (zip rescan, ~10 min) -> `count` (new films
   only) -> `enrich` (new films only, ~20 min) -> `derive --corpus en` and
   `--corpus all` -> `build_movies_index.py` x2 -> `rebuild_web_data.py
   --corpus en|all` x2 -> `fetch_posters.py` (new films only, ~40 min).
3. Upload from the VM via rclone with `upload_r2.sh` conventions
   (Cache-Control json=300s, parquet/posters=86400; zone purge after).
4. The VM is left running; Andrew decides when to delete it after prod
   verification.

## App changes

- **Corpus registry** (new module): `{id, urlPrefix, label, description}` per
  corpus; nothing else hardcodes corpus names or prefixes. Future corpora
  (e.g. a different subtitle language, suggested prefix `sub-de/`) and a
  future `lang=xx` filter param compose with - not replace - this registry.
  UI strings for toggle/badge/FAQ surfaces flow from it, keeping the later
  33-language i18n pass single-touch for corpus copy.
- **Corpus state:** `?c=all` URL param wins, then localStorage, then default
  `en`. Toggling reloads the page preserving route + param - no reactive
  invalidation of in-flight hooks/DuckDB views for a rarely-flipped switch.
- `data.ts`/`duck.ts`: all data paths (fetchJSON and `pq()`) go through the
  active corpus's `urlPrefix`.
- **Header toggle:** compact two-state switch "English originals | All
  films", tooltip explainer, FAQ link. Internal links preserve `c=all` via
  the route helper.
- **Badges:** in `all` mode, movie pages and search results show a
  "translated subtitles" badge with the original language code when
  `original_language !== 'en'`.
- **Copy:** FAQ entry for the toggle; footer dataset section documents the
  `all/` prefix; README/DATA.md/ARCHITECTURE.md updated (vote floor, corpus
  counts, toggle, word_year_lang).

## Testing

- Pipeline: unit tests for derive corpus parameterization (filter on/off,
  output dirs, original_language column, word_year_lang), movies-index
  script, superlatives votes floor; existing 53 tests keep passing.
- App: unit tests for corpus resolution precedence (URL > localStorage >
  default), path prefixing, link param preservation.
- Prod verification (fresh browser profile): toggle on every major view,
  ranged 206 responses on `all/` parquets, badge rendering, shared-link
  corpus fidelity, homepage still 2 data requests in default mode.

## Risks / notes

- The default site changes too: more films + refreshed IMDb ratings shift
  leaderboard-ish numbers. Inherent to the vote-floor decision; disclosed in
  the session record.
- Bucket grows to ~6-7GB of the 10GB free tier; ~80k new JSON objects upload
  once (rclone additive, minutes from the VM).
- `all` vocabulary is bigger and junkier (translationese, OCR survivors);
  existing quality filters guard the curated surfaces, and the superlatives
  votes floor is added in this work.
- Deadline risk: if the VM evaporates, everything is rebuildable from
  scratch in ~3h + ~$1 of compute, but do it before credits expire.
