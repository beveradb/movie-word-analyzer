# Movie Word Analyzer — full build & launch — 2026-09-11/12

**Project:** movie-word-analyzer   **Branch/commit:** main @ 49447b3   **Status:** done (site live, full dataset)

## Summary

Single marathon session from idea to launched product. Researched prior art
(none exists: SUBTLEX-style corpora are aggregate-only; english-corpora.org is
closed), designed, built, and launched **https://moviewords.beveradb.com** — a
fully static explorer of the words spoken in **18,761 English-original films**,
derived from the OPUS OpenSubtitles v2024 corpus on a temporary GCP VM.

## What changed

- **Repo created** (public, beveradb/movie-word-analyzer) with spec
  (`docs/superpowers/specs/`) and pipeline plan (`docs/superpowers/plans/`).
- **Pipeline built** (`pipeline/`, Python 3.12/uv/duckdb, 53 tests) via
  subagent-driven TDD: stages download → curate → index → count → enrich →
  derive, each resumable; per-movie caches for count (keyed lang+id+subtitle
  file) and TMDB enrich.
- **Cloudflare infra**: R2 bucket `moviewords-data` + custom domain
  moviewords-data.beveradb.com (CORS to app origin + localhost), Pages project
  `moviewords` at moviewords.beveradb.com (CNAME in beveradb.com zone).
- **Frontend** (`app/`, Vite+React+TS+Tailwind v4 + DuckDB-WASM): screenplay
  aesthetic (Courier Prime, highlighter-mark signature element), views: home,
  movie, trends (+ "films that say it most"), leaderboard, compare (movies/
  decades/genres mixed), decade/genre entity pages with SVG motifs, auto dark
  mode with toggle, word filters (Zipf commonness + WordNet POS classes),
  self-hosted posters.
- **Full dataset run on GCP** VM `moviewords-pipeline-tmp` (nomadkaraoke
  project, e2e-highmem-4, 200GB): 34GB corpus download, 33,380 films counted,
  TMDB-enriched, 18,761 English-original films published; 18,758 posters
  fetched from TMDB into R2. Iterative data-quality re-runs (see decisions).
- **Datasets on R2**: movies.parquet, words_by_movie/, words_by_word/,
  word_year.parquet, word_meta.parquet, json/ hot paths (movie/*, leaderboard,
  wordlists, signature/{decades,genres}, movies-index), posters/.
- Starter dataset before the big run: Cornell Movie-Dialogs (610 real films)
  through the same derive path (`pipeline/scripts/build_demo_dataset.py`).

## Decisions & rationale

- **OPUS bulk corpus, not the OpenSubtitles API** — corpus ships per-movie
  files with IMDb IDs; no rate limits.
- **Movies ≥1,000 IMDb votes, English-original only** — translated subs would
  measure translators, not dialogue. 14,619 counted films are excluded by this
  filter but remain in the VM caches (revisitable with one derive flag).
- **Only bags of words published** — copyright-safe; no subtitle text leaves
  the pipeline.
- **Fully static architecture** — DuckDB-WASM queries R2 parquet over HTTP
  range requests; pre-baked JSON for hot paths; zero servers (hf2 unused).
- **TMDB for country/original-language/posters** (v3 key or v4 token both
  supported); posters self-hosted in R2 so traffic never hits TMDB's CDN.
- **Log-odds w/ informative Dirichlet prior (Monroe et al.)** for signature
  words — the product's signature feature; generalized to decades/genres with
  a ≥3-distinct-films floor to kill one-film OCR artifacts.
- **Word filtering via word_meta** — wordfreq Zipf (common ≥5.0) + WordNet POS
  letters (n/v/a/r; absent = "x" ≈ names class).
- **Tokenizer rules** hardened iteratively (each with tests): curly-apostrophe
  normalization, quote-pair stripping, NFKD diacritic folding, digit-adjacent
  rejection ("1950s"→junk "s"), single-letter noise (keep a/i), apostrophe-run
  collapse ("don''t" OCR artifacts).

## Learnings / gotchas

- **Never query per-movie over the big parquet in derive** — 33k × per-movie
  queries = ~6h; one streaming pass over the sorted parquet = ~3min (130×).
  The sort orders of words_by_movie/words_by_word ARE the access contract.
- `ls FILE_A FILE_B` in a wait-loop requires BOTH to exist — bit us once;
  use `[ -e A ] || [ -e B ]` style conditions.
- `pkill -f "pattern"` over SSH kills the SSH session itself if the pattern
  matches the remote command line — use `[c]har-class` self-exclusion.
- rclone→R2: 501 NotImplemented on modtime updates for unchanged files is
  harmless noise; syncs still converge.
- R2 S3 credentials can be derived from any CF API token with R2 perms:
  access_key_id = token id (from /user/tokens/verify), secret = sha256(token).
- OPUS v2024 en.zip ≈ 34GB; count of 33k films takes ~15 min on 4 weak cores;
  TMDB enrich ~83 min at ~7 req/s with per-movie JSON cache.
- gcloud default project ≠ the project you want (`api-project-*` had no
  Compute API); the real project id was literally `nomadkaraoke`.
- GCP startup-script + systemd-run transient units + marker files
  (`/opt/*_DONE`) make multi-stage unattended chains resumable and observable
  from a laptop with short-lived SSH polls.

## Open threads & next steps

- **GCP VM `moviewords-pipeline-tmp` is still RUNNING** (Andrew reviewing;
  credits expire ~2026-09-19). Delete when done:
  `gcloud compute instances delete moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a`
- Possible expansions (cheap; caches on VM): include translated-sub films as a
  labeled toggle, more languages, TV, votes ≥100, Hugging Face dataset mirror.
- CI: no GitHub Actions yet — deploys are manual `wrangler pages deploy`.
- 3 films lack posters; entity pages could use signature JSON tops for
  "notable scripts" instead of votes.

## Related docs

- `docs/superpowers/specs/2026-09-11-movie-word-analyzer-design.md` (spec)
- `docs/superpowers/plans/2026-09-11-data-pipeline.md` (pipeline plan)
- `pipeline/README.md` (runbook), `docs/ARCHITECTURE.md` (written this session)
