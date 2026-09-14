# Movie Word Analyzer — Design

**Date:** 2026-09-11
**Status:** Approved
**Repo:** https://github.com/beveradb/movie-word-analyzer

## Purpose

A free, public web app to explore the words spoken in movies: per-film word
frequencies, cross-film word trends over time, and leaderboards — filterable by
year, country of origin, genre, and rating. No comparable open-source tool
exists (SUBTLEX-style corpora are aggregate-only; english-corpora.org/movies is
closed and academic). The derived dataset is itself a publishable artifact.

## Scope (v1)

- **Language:** English only.
- **Corpus:** feature films (no TV) with ≥1,000 IMDb votes — roughly 30–40k
  titles matched between OPUS OpenSubtitles v2024 and IMDb.
- **Features:**
  1. **Per-movie word explorer** — top words (stopword toggle), distinctive
     words vs corpus (log-odds), stats: total words, unique words, words/minute.
  2. **Word trends** — a word's frequency across movies by year, filterable by
     country/genre (Ngrams-for-movie-dialogue).
  3. **Top-words leaderboard** — most-used words across films, filterable by
     year range, country, genre, rating.
  4. **Movie comparison** — 2+ movies side by side: distinctive shared/unique
     vocabulary, vocabulary richness, swearing counts.
- **Out of scope for v1:** other languages, TV episodes, character/speaker
  attribution, phrase (n-gram) analysis, user accounts.

## Architecture

Fully static. No backend servers; homefanless2 is not used.

```
[Mac: Python batch pipeline]
   OPUS OpenSubtitles v2024 (en, per-movie, IMDb IDs)
   IMDb datasets (title.basics, title.ratings)
   TMDB API (country of origin, original language)
        │  clean → tokenize → count → enrich → derive
        ▼
[R2 public bucket]  moviewords-data.beveradb.com  (CORS: app origin)
   movies.parquet, word_counts (×2 sort orders), pre-baked JSON
        ▲  HTTP range requests (DuckDB-WASM) + plain fetch (JSON)
        │
[Cloudflare Pages]  moviewords.beveradb.com
   Vite + React + TS + Tailwind SPA, DuckDB-WASM in a web worker
```

## Data pipeline (Python, `pipeline/`)

1. **Ingest:** download OPUS OpenSubtitles v2024 English corpus and IMDb
   non-commercial datasets. Raw downloads land in `data/raw/` (gitignored).
2. **Curate:** IMDb `titleType = movie` AND `numVotes ≥ 1000`; intersect with
   OPUS IMDb IDs. Multiple subtitle files per movie → pick largest non-outlier;
   drop files whose token count is implausible for the film's runtime.
3. **Clean & count:** strip tags, subtitle-credit lines ("Subs by…"), SDH/song
   markers; lowercase; tokenize; count → per-movie bag of words. Word order is
   destroyed; no subtitle text is redistributed.
4. **Enrich:** year/genres/runtime/rating/votes from IMDb; production countries
   and original language from TMDB by IMDb ID (free API key required; one
   request per film). Keep only films whose original language is English.
5. **Derive:** per-movie stats (total/unique words, words-per-minute),
   per-movie distinctive words (log-odds ratio vs corpus), word × year
   aggregates for trends, corpus-wide word totals, stopword and profanity word
   lists baked into the dataset.

The pipeline is a manual batch run on the Mac; re-run occasionally to refresh.
Each stage is idempotent and resumable (cached intermediates in `data/work/`).

## Published dataset (R2; later mirrored to Hugging Face)

| Artifact | Contents | Access pattern |
|---|---|---|
| `movies.parquet` | one row/film: IMDb ID, title, year, countries, genres, runtime, rating, votes, stats | loaded fully by app at startup |
| `words_by_movie/*.parquet` | (imdb_id, word, count) sorted/partitioned by movie | per-movie explorer, comparison |
| `words_by_word/*.parquet` | (word, imdb_id, count) sorted/partitioned by word | trends, leaderboard |
| `word_year.parquet` | (word, year, count, movie_count) | default trends view |
| `json/movie/<imdb_id>.json` | top-200 words + distinctive words + stats | instant per-movie render |
| `json/leaderboard-default.json` | unfiltered top words | instant leaderboard render |

Estimated total ~2–4GB (within R2 10GB free tier; egress is free). The two
sort orders trade storage (cheap) for fast HTTP-range access in both patterns.

## Frontend (`app/`)

- Vite + React + TypeScript + Tailwind; chart styling per the dataviz skill.
- Four routes with URL-encoded state for shareable links:
  `/movie/:imdbId`, `/trend?word=…&country=…`, `/leaderboard?…`, `/compare?ids=…`.
- DuckDB-WASM lazily initialized in a web worker; pre-baked JSON serves first
  paint so no view blocks on WASM startup.
- Default "hide stopwords" toggle (on by default); no other content filtering.

## Deployment

- **Pages:** `moviewords.beveradb.com`, deployed manually with wrangler
  (`wrangler pages deploy dist --project-name moviewords --branch=main`).
  No CI/CD is set up - the original plan to use GitHub Actions was dropped;
  credentials live only in a local direnv file outside the repo.
- **R2:** public bucket behind `moviewords-data.beveradb.com`, CORS restricted
  to the app origin (plus localhost for dev). Pipeline uploads via wrangler or
  rclone, run manually after dataset builds.

## Error handling

- Pipeline: per-file failures logged and skipped, never fatal; a final report
  lists match rate and drop reasons so corpus quality is inspectable.
- App: if R2/DuckDB queries fail, views fall back to pre-baked JSON where
  possible and show a retry state otherwise; unknown movie IDs → friendly 404.

## Testing

- **Pipeline:** pytest units for cleaner/tokenizer (credit stripping, tags),
  subtitle-selection heuristics, and stats/log-odds math, over small fixture
  subtitle files; a golden end-to-end test building a tiny fixture corpus.
- **App:** component tests for query builders and state↔URL codecs; one
  Playwright smoke test running the built site against fixture data,
  exercising all four views.

## Licensing & attribution

- Code: MIT. Dataset: CC BY-NC-SA 4.0 (respects IMDb non-commercial terms).
- Footer attribution: OPUS/OpenSubtitles (cite Lison & Tiedemann 2016), IMDb,
  TMDB (logo + required notice). Site is non-commercial.

## Decisions log

- English-only v1 (multilingual later; corpus layout is per-language identical).
- Movies ≥1,000 IMDb votes; no TV.
- Fully static over hf2 backend: all features are precomputable; zero moving parts.
- OPUS bulk corpus over OpenSubtitles API: bulk data with IMDb IDs already
  exists; API reserved for possible future incremental updates.
- TMDB over OMDb for country metadata: no meaningful daily cap (OMDb free tier
  is 1,000 req/day).
