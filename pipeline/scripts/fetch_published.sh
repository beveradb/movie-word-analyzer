#!/usr/bin/env bash
# Mirror the published datasets needed by rebuild_web_data.py into webdata/in.
# words_by_word (the biggest parquet) is intentionally not needed.
set -euo pipefail
BASE="${DATA_BASE:-https://data.moviewords.org}"
DEST="$(dirname "$0")/../webdata/in"
mkdir -p "$DEST/signature"

fetch() { # $1 remote path, $2 local name
  if [ ! -s "$DEST/$2" ]; then
    echo "fetching $1"
    # download to a temp name then move: an interrupted transfer must not
    # leave a truncated file that the -s check would treat as cached
    curl -fSs --retry 3 -o "$DEST/$2.tmp" "$BASE/$1"
    mv "$DEST/$2.tmp" "$DEST/$2"
  else
    echo "cached  $2"
  fi
}

fetch movies.parquet movies.parquet
fetch word_year.parquet word_year.parquet
fetch words_by_movie/data.parquet words_by_movie.parquet
fetch json/signature/decades.json signature/decades.json
fetch json/signature/genres.json signature/genres.json
ls -lh "$DEST"
