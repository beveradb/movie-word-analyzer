# Architecture & Methodology

How https://moviewords.beveradb.com works, why it's built this way, and enough
detail to reproduce or extend it. See also the original design spec
(`docs/superpowers/specs/2026-09-11-movie-word-analyzer-design.md`) and the
session records under `docs/sessions/`.

## System overview

```
 OFFLINE (batch, run anywhere — laptop or throwaway cloud VM)
 ┌──────────────────────────────────────────────────────────────┐
 │ OPUS OpenSubtitles v2024 (en, per-movie XML, IMDb ids, ~34GB)│
 │ IMDb non-commercial datasets (title.basics, title.ratings)   │
 │ TMDB API (original_language, production countries, posters)  │
 │        │                                                     │
 │        ▼  pipeline/ (Python 3.12 · uv · duckdb · pyarrow)    │
 │ download → curate → index → count → enrich → derive          │
 └───────────────┬──────────────────────────────────────────────┘
                 ▼  rclone sync (S3 API)
 ┌──────────────────────────────────────────────────────────────┐
 │ Cloudflare R2 (public bucket, custom domain, CORS)           │
 │   parquet: movies · words_by_movie · words_by_word ·         │
 │            word_year · word_meta                             │
 │   json:    movie/<id> · leaderboard · wordlists ·            │
 │            signature/{decades,genres} · movies-index         │
 │   posters/<id>.jpg (self-hosted, TMDB-sourced)               │
 └───────────────┬──────────────────────────────────────────────┘
                 ▼  plain fetch (hot paths) + DuckDB-WASM (SQL over
                    HTTP range requests — no backend anywhere)
 ┌──────────────────────────────────────────────────────────────┐
 │ Cloudflare Pages: app/ (Vite · React · TS · Tailwind v4)     │
 └──────────────────────────────────────────────────────────────┘
```

There are **no servers**. Hot paths (movie pages, default leaderboard) are
pre-baked JSON; everything interactive (trends, filtered leaderboards,
word→top-films, swear rates) is DuckDB-WASM in a web worker reading Parquet
directly from R2 with range requests. R2 egress is free, so a traffic spike
costs nothing and hits nobody else's infrastructure.

## The dataset contract

Everything the frontend consumes, all under `data/out/` → R2 bucket root:

| Artifact | Contents | Access pattern |
|---|---|---|
| `movies.parquet` | one row/film: imdb_id, title, year, countries, genres, runtime_minutes, rating, votes, total_words, unique_words, words_per_minute | SQL joins |
| `words_by_movie/data.parquet` | (imdb_id, word, count) **sorted (imdb_id, count DESC)** | per-movie scans (swear counts) |
| `words_by_word/data.parquet` | same rows **sorted (word, imdb_id)** | per-word scans (top films for a word) |
| `word_year.parquet` | (word, year, count, movie_count), corpus-total ≥ 20 | trends |
| `word_meta.parquet` | (word, zipf, classes) for the whole vocab | leaderboard class filters |
| `json/movie/<id>.json` | stats + top/top_all/distinctive; entries `[word, value, zipf, classes]` | movie page (no WASM needed) |
| `json/leaderboard-default.json` | top 1000 (+50 stopwords), entries `[word, count, movies, zipf, classes]` | leaderboard first paint |
| `json/signature/{decades,genres}.json` | per-entity: movie_count, total_words, top[100], signature[100] | entity pages, compare |
| `json/wordlists.json` | stopword + profanity lists | stopword toggle, swear counts |
| `json/movies-index.json` | slim all-movies list (search index) | client-side search |
| `posters/<id>.jpg` | TMDB w342 posters, self-hosted | `<img>` with fallback |

**The two sort orders are load-bearing**: DuckDB prunes row groups using them,
which is what makes browser-side SQL over a ~45M-row table feel instant. The
same property matters offline — see "performance lessons" below.

## Methodology

**Word counts.** Subtitle XML → cleaned dialogue (`subtitle_parser.py`: strips
timestamps, formatting tags, SDH cues in ()/[] — deliberate, they're cue
delimiters — credit/URL lines, ♪ lines) → tokens (`wordcount.py`). Tokenizer
rules, each motivated by a real artifact found in the corpus and pinned by a
test: lowercase; curly→ASCII apostrophes; apostrophe-run collapse (`don''t`
OCR style); quote-pair stripping that spares contractions/elisions; NFKD
diacritic folding (café→cafe); digit-adjacent rejection (1950s → junk "s");
single-letter noise dropped except a/i; hyphenated words split. **Only bags of
words are ever persisted or published — word order is destroyed at count time
and no subtitle text is redistributed.**

**Corpus cut.** IMDb `titleType=movie`, `numVotes ≥ 1000`, matched to OPUS by
IMDb id; one subtitle file chosen per film (largest within a plausibility band
of 20–250 tokens/min of runtime); TMDB `original_language == en` (translated
subtitles measure translators, not screenwriters — the 14.6k non-English
originals are counted and cached but not published; that's a one-flag change
in `derive.py` to revisit).

**Signature words** (the product's core idea): log-odds ratio with informative
Dirichlet prior (Monroe, Colaresi & Quinn 2008), the corpus as prior
(`derive.log_odds`, alpha0=100). A movie, a decade, and a genre are all just
bags of words vs the corpus. Entity (decade/genre) signatures additionally
require a word to appear in ≥3 distinct films so a single film's OCR junk or
character name can't dominate.

**Word classes** (`derive.word_meta`): wordfreq Zipf frequency = "commonness"
(UI hides ≥5.0 as "everyday"); WordNet synset POS letters n/v/a/r; words
WordNet doesn't know get class "x" — which in practice is the character-names
class, often the most interesting filter.

**Resumability** (a hard requirement): the two expensive stages keep one cache
file per movie — counts keyed by (language, imdb_id, source zip entry), TMDB
by imdb_id — so any rerun or scope expansion (lower vote floor, TV, more
languages) reprocesses only new items. Caches are written atomically
(tmp + rename) and unreadable cache files are treated as misses, never crashes.

## Toolchain

| Layer | Tools |
|---|---|
| Pipeline | Python 3.12, uv, duckdb, pyarrow, requests, wordfreq, nltk (WordNet), pytest (53 tests incl. fixture-corpus e2e) |
| Data hosting | Cloudflare R2 (free tier: 10GB, free egress), rclone (S3 API; creds derivable from a CF API token: key id = token id from `/user/tokens/verify`, secret = sha256 of the token) |
| Frontend | Vite, React 19, TypeScript, Tailwind v4 (`@theme` tokens; dark mode = token flip on `.dark`), @duckdb/duckdb-wasm (jsDelivr bundles), hand-rolled SVG chart |
| App hosting | Cloudflare Pages (`wrangler pages deploy app/dist --project-name moviewords`) |
| Batch compute | any box with ~60GB disk; we used a throwaway GCP e2-highmem-4 with a startup-script + systemd-run stage chain and `/opt/*_DONE` marker files |
| Verification | Playwright (MCP) against the live site; dataviz palette validator for chart colors (light + dark surfaces, CVD checks) |

## Key decisions log

1. **OPUS bulk corpus over the OpenSubtitles API** — per-movie files with IMDb
   ids, one 34GB download, no rate limits. API reserved for future increments.
2. **Fully static over a backend** — every feature is precomputable or
   expressible as browser-side SQL; zero moving parts, zero hosting cost.
3. **TMDB over OMDb** — no meaningful rate cap (OMDb free = 1k/day); also
   supplies posters. Both v3 key and v4 token auth supported.
4. **Posters self-hosted in R2** — independence from third-party CDNs under
   load; TMDB attribution kept in the footer.
5. **Screenplay visual identity** — Courier Prime, slug-line headers,
   highlighter-mark word bars (the signature element; mark width encodes the
   value). Chart palettes machine-validated for CVD on both surfaces:
   light `#3E6FA8/#CC5A2E/#6B5AA8/#128A5E`, dark `#5B8BC4/#D9744C/#8A77C0/#2FA477`.
6. **English-original-only v1** — see methodology; revisitable.
7. **Licensing** — code MIT; published dataset is derived word counts under
   CC BY-NC-SA 4.0 (IMDb non-commercial terms). Attribution required on site:
   OPUS (Lison & Tiedemann 2016), OpenSubtitles.org (corpus condition), IMDb,
   TMDB.

## Performance lessons (hard-won)

- **Never loop per-movie queries over the big parquet.** Writing the per-movie
  JSONs as 33k individual `WHERE imdb_id = ?` queries ran at ~80 files/min
  (~6h); one streaming pass over the already-sorted parquet with a group-break
  in Python ran at ~10,500/min (~130×). If derive feels slow, this is why.
- The 33k-film count stage itself is fast (~15 min on 4 weak cores) because it
  streams straight out of the zip — never extract the corpus.
- rclone→R2 logs `501 NotImplemented` when it tries to update modtimes on
  files whose bytes didn't change; harmless, syncs converge (`--checksum`).
