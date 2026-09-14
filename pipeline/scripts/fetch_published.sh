#!/usr/bin/env bash
# Mirror the published datasets needed by rebuild_web_data.py into webdata/in.
# words_by_word (the biggest parquet) is intentionally not needed.
set -euo pipefail
CORPUS="${1:-en}"
BASE="${DATA_BASE:-https://data.moviewords.org}"
if [ "$CORPUS" = "all" ]; then
  PREFIX="all/"
  DEST="$(dirname "$0")/../webdata/in/all"
else
  PREFIX=""
  DEST="$(dirname "$0")/../webdata/in"
fi
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

fetch "${PREFIX}movies.parquet" movies.parquet
fetch "${PREFIX}word_year.parquet" word_year.parquet
fetch "${PREFIX}words_by_movie/data.parquet" words_by_movie.parquet
fetch "${PREFIX}json/signature/decades.json" signature/decades.json
fetch "${PREFIX}json/signature/genres.json" signature/genres.json
ls -lh "$DEST"
