"""Build a small REAL dataset from the Cornell Movie-Dialogs Corpus (~617 films).

Stopgap until the full OPUS corpus run (needs TMDB_API_TOKEN + ~60GB disk; see
pipeline/README.md). Reuses the real pipeline pieces — wordcount.tokenize,
counts._compact, derive.run — so it exercises the exact production derive path
and emits the exact published-dataset contract to data/out/.

Caveats vs the full dataset (documented on the site): no runtime/words-per-minute,
no production countries (Cornell metadata lacks both), ids are Cornell m### ids.

Run: cd pipeline && uv run python scripts/build_demo_dataset.py
"""
import io
import re
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402
import pyarrow as pa  # noqa: E402
import pyarrow.parquet as pq  # noqa: E402

from moviewords_pipeline import config, derive  # noqa: E402
from moviewords_pipeline.counts import _compact  # noqa: E402
from moviewords_pipeline.download import fetch  # noqa: E402
from moviewords_pipeline.wordcount import count_words  # noqa: E402

CORNELL_URL = "https://www.cs.cornell.edu/~cristian/data/cornell_movie_dialogs_corpus.zip"
SEP = " +++$+++ "


def parse_metadata(raw):
    movies = {}
    for line in io.TextIOWrapper(raw, encoding="iso-8859-1"):
        mid, title, year, rating, votes, genres = line.rstrip("\n").split(SEP)
        year = int(year[:4]) if year[:4].isdigit() else None
        if year is None:
            continue
        # str.title() capitalizes after apostrophes ("Schindler'S"); fix those.
        pretty = re.sub(r"(\w)'(\w)", lambda m: m.group(1) + "'" + m.group(2).lower(),
                        title.title())
        movies[mid] = {
            "imdb_id": mid, "title": pretty, "year": year,
            "runtime_minutes": None,
            "genres": list(dict.fromkeys(g for g in json.loads(genres.replace("'", '"')) if g)),
            "rating": float(rating), "votes": int(votes),
        }
    return movies


def parse_lines(raw, movies):
    texts = {mid: [] for mid in movies}
    for line in io.TextIOWrapper(raw, encoding="iso-8859-1"):
        parts = line.rstrip("\n").split(SEP)
        if len(parts) == 5 and parts[2] in texts:
            texts[parts[2]].append(parts[4])
    return {mid: "\n".join(lines) for mid, lines in texts.items() if lines}


def main():
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = fetch(CORNELL_URL, config.RAW_DIR / "cornell.zip")
    with zipfile.ZipFile(zip_path) as z:
        base = next(n for n in z.namelist() if n.endswith("movie_titles_metadata.txt"))
        prefix = base.rsplit("/", 1)[0]
        with z.open(f"{prefix}/movie_titles_metadata.txt") as f:
            movies = parse_metadata(f)
        with z.open(f"{prefix}/movie_lines.txt") as f:
            texts = parse_lines(f, movies)

    records = []
    for mid, text in texts.items():
        counts = dict(count_words(text))
        if sum(counts.values()) < 500:  # skip near-empty scripts
            continue
        records.append({"imdb_id": mid, "zip_name": "cornell", "counts": counts,
                        "total_words": sum(counts.values()),
                        "unique_words": len(counts), "words_per_minute": None})
    kept = {r["imdb_id"] for r in records}
    print(f"cornell: {len(movies)} films in metadata, {len(records)} with dialogue kept")

    # Synthesize the WORK_DIR artifacts the derive stage consumes.
    rows = [m for mid, m in movies.items() if mid in kept]
    pq.write_table(pa.table({
        "imdb_id": [m["imdb_id"] for m in rows],
        "title": [m["title"] for m in rows],
        "year": pa.array([m["year"] for m in rows], pa.int32()),
        "runtime_minutes": pa.array([None] * len(rows), pa.int32()),
        "genres": [m["genres"] for m in rows],
        "rating": [m["rating"] for m in rows],
        "votes": [m["votes"] for m in rows],
    }), config.WORK_DIR / "curated.parquet")
    pq.write_table(pa.table({"imdb_id": sorted(kept),
                             "zip_name": ["cornell"] * len(kept)}),
                   config.WORK_DIR / "corpus_index.parquet")
    _compact(records, config.WORK_DIR / "word_counts.parquet",
             config.WORK_DIR / "movie_stats.parquet")
    tmdb_dir = config.WORK_DIR / "tmdb"
    tmdb_dir.mkdir(exist_ok=True)
    for mid in kept:  # countries unknown in Cornell metadata — empty, not guessed
        (tmdb_dir / f"{mid}.json").write_text(json.dumps(
            {"imdb_id": mid, "countries": [], "original_language": "en"}))

    derive.run()
    n = duckdb.sql(f"SELECT COUNT(*) FROM '{config.OUT_DIR / 'movies.parquet'}'").fetchone()[0]
    print(f"derive complete: {n} movies in data/out ({config.OUT_DIR})")
    print((config.OUT_DIR / "report.md").read_text())


if __name__ == "__main__":
    main()
