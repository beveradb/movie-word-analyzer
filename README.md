# movie-word-analyzer

Explore the words spoken in movies: per-film word frequencies and cross-film trends,
filterable by year, country, genre, and more.

Built from the [OPUS OpenSubtitles corpus](https://opus.nlpl.eu/datasets/OpenSubtitles)
(per-movie subtitles with IMDb IDs) plus IMDb/TMDB metadata. Only derived word-count
data (bags of words) is published — no subtitle text is redistributed.

**Live:** https://moviewords.beveradb.com — frontend on Cloudflare Pages (`app/`,
Vite + React + DuckDB-WASM), dataset on R2 at `moviewords-data.beveradb.com`.

Currently serving a 610-film starter dataset built from the Cornell Movie-Dialogs
Corpus (`pipeline/scripts/build_demo_dataset.py`). The full ~30k-film OpenSubtitles
build is pending — see `pipeline/README.md` for the runbook (needs a TMDB key —
`TMDB_API_TOKEN` or `TMDB_API_KEY` env — and ~60GB free disk).

Deploy: `cd app && npm run build && wrangler pages deploy dist --project-name moviewords`.
Dataset upload: `pipeline/scripts/upload_r2.sh` (rclone) or per-object `wrangler r2 object put`.
