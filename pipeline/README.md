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
uv run python -m moviewords_pipeline.cli count

# Fetch production country, language, and poster data from TMDB
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

For additional languages:

- Modify `config.py` to add `LANG = "fr"` (or another ISO 639-1 code)
- Update `OPUS_URL` to point to the language's zip file
- Re-run `download → curate → index → count → enrich → derive`
- The count stage will create a new per-language cache: `work/counts/fr/`
- The TMDB cache (`work/tmdb/`) is language-independent and reused across runs

## Output

Artifacts land in `data/out/`:

- `report.md` — summary statistics and per-movie word frequency tables
- `movie_by_word.parquet` — (optional) words indexed by film, sorted by word
- `word_by_movie.parquet` — (optional) films indexed by word, sorted by film
- `word_year_trends.parquet` — (optional) annual word frequency trends

All outputs are uploaded to the R2 bucket `moviewords-data/` via `upload_r2.sh`.
