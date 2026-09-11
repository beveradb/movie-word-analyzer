# movie-word-analyzer pipeline

End-to-end data pipeline: download OPUS subtitles, curate to top-voted films, parse
words, count frequencies, enrich with TMDB metadata, and derive per-movie/cross-film
word statistics.

## Prerequisites

Before running the pipeline, ensure you have:

- **uv** — Python package manager (https://astral.sh/uv)
- **rclone** — Sync tool for R2 upload (https://rclone.org)
- **~60GB free disk** — pipeline uses significant temporary space
- **TMDB API token** — retrieve from https://www.themoviedb.org/settings/api
  - Visit Settings → API → Read (API Key)
- **Cloudflare R2 S3 credentials** — create in the Cloudflare dashboard
  - Navigate to R2 → Manage API Tokens → Create API Token
  - Save: Account ID, Access Key ID, Secret Access Key (separate from main API token)

## One-Time Setup

Create the R2 bucket (requires Cloudflare account):

```bash
cd pipeline
wrangler r2 bucket create moviewords-data
```

## Full Run

Run stages sequentially from the `pipeline/` directory:

```bash
cd pipeline

# Download ~15–30GB of OPUS OpenSubtitles corpus
# Duration: hours, depending on connection and disk speed
uv run python -m moviewords_pipeline.cli download

# Curate to IMDb votes >= 1000 (see config.py)
uv run python -m moviewords_pipeline.cli curate

# Build corpus index linking IMDb IDs to subtitle zip entries
uv run python -m moviewords_pipeline.cli index

# Parse subtitles and count word frequencies
# Duration: CPU-bound, ~1–3 hours
# Per-movie cache in work/counts/en/ (skips already-processed films)
#
# RUNBOOK NOTE: the tokenizer (wordcount.TOKEN_RE) changed to reject
# digit-adjacent tokens (e.g. "1950s" -> "s", "42nd" -> "nd" junk tokens).
# If you have an existing work/counts/en/ cache built before this change,
# delete it before the first real run afterwards so every film is re-parsed
# with the corrected tokenizer — otherwise stale per-movie caches will keep
# serving counts derived from the old, junk-token-producing regex.
#   rm -rf ../data/work/counts/
uv run python -m moviewords_pipeline.cli count

# Fetch production country and original-language metadata from TMDB
# Duration: ~1 hour (API rate-limited to ~20 req/s)
# Requires TMDB_API_TOKEN environment variable
# Per-movie cache in work/tmdb/ (skips already-fetched films)
TMDB_API_TOKEN=... uv run python -m moviewords_pipeline.cli enrich

# Derive per-movie and cross-film statistics
# Quick: re-run anytime to regenerate reports
uv run python -m moviewords_pipeline.cli derive

# Inspect sanity metrics (expect ~30–40k curated films, >70% TMDB match rate)
cat ../data/out/report.md

# Upload to R2 (requires env vars CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
./scripts/upload_r2.sh
```

## Resumability & Idempotence

Every stage is resumable and idempotent:

- **count** stage: caches word counts per IMDb ID in `work/counts/en/` (JSON per film).
  If a film is already cached, it is skipped; only new or modified films are re-parsed.

- **enrich** stage: caches TMDB lookups per IMDb ID in `work/tmdb/` (JSON per film).
  If a film is already cached, the API call is skipped.

- **derive** stage: re-reads all cached counts and TMDB data, regenerates reports.
  Safe and fast to re-run anytime.

If the pipeline crashes, re-run the same command to resume from where it left off.

## Scope Expansion

To broaden the film corpus in the future (e.g., lower `MIN_VOTES = 1000` to include
lower-voted films):

1. Edit `src/moviewords_pipeline/config.py` and adjust `MIN_VOTES`
2. Re-run: `curate → index → count → enrich → derive`
   - **curate** will emit a new set of qualified films
   - **index** maps them to subtitle zip entries
   - **count** processes only newly-included films (existing cache entries are reused)
   - **enrich** fetches metadata only for new films (existing TMDB lookups are reused)
   - **derive** regenerates all reports

For additional languages (English-only today, not yet a supported path):

- The `LANG`/`OPUS_URL` config knobs and the per-language `work/counts/<lang>/`
  cache layout are designed to make this possible in principle, but the rest of
  the pipeline currently assumes English: `wordcount.TOKEN_RE` only matches
  `[a-z']` characters (no accented/non-Latin scripts beyond NFKD-foldable Latin
  ones), and the stopword/profanity wordlists shipped in this package
  (`stopwords_en.txt`, `profanity_en.txt`) are English-only.
- Adding a real second language would require a language-aware tokenizer and
  per-language wordlists in addition to changing `config.py` and `OPUS_URL`.

## Output

Artifacts land in `data/out/`:

- `movies.parquet` — one row per published film: IMDb id, title, year,
  countries, genres, runtime, rating, votes, word-count stats
- `words_by_movie/data.parquet` — per-movie word counts, ordered by
  `(imdb_id ASC, count DESC)`
- `words_by_word/data.parquet` — per-movie word counts, ordered by
  `(word ASC, imdb_id ASC)`
- `word_year.parquet` — annual word frequency trends (words with corpus-wide
  count >= 20 only)
- `json/movie/<imdb_id>.json` — per-movie hot-path payload (stats, top words,
  top words excluding stopwords, log-odds-distinctive words)
- `json/leaderboard-default.json` — cross-corpus word leaderboard (top 1000
  non-stopwords, top 50 stopwords)
- `json/wordlists.json` — `{"stopwords": [...], "profanity": [...]}`, the
  same lists the pipeline uses internally, published so the frontend can
  offer a stopword-hiding toggle and compute swearing counts without
  shipping its own copies
- `report.md` — summary statistics and stage-by-stage drop reasons

All outputs are uploaded to the R2 bucket `moviewords-data/` via `upload_r2.sh`.
