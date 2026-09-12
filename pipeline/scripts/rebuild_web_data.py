#!/usr/bin/env python
"""Rebuild published web data from the already-published parquets — no VM, no
raw subtitles. Regenerates:

  meta        word_meta.parquet (adds pos, dist) + json/leaderboard-default.json
  movies      json/movie/*.json (word rows gain pos)
  boards      json/leaderboards/{shifts,films,wonders,everywhere}.json
  signatures  json/signature/{decades,genres}.json (adds stats + top500)

Usage:
  scripts/fetch_published.sh   # once, mirrors inputs to webdata/in
  uv run python scripts/rebuild_web_data.py [--stage all|meta|movies|boards|signatures]

Outputs land in webdata/out mirroring the R2 layout; sync that dir to the
moviewords-data bucket, then deploy the app.
"""

import argparse
import json
import time
from pathlib import Path

import duckdb

from moviewords_pipeline import boards
from moviewords_pipeline.derive import load_profanity, load_stopwords, log_odds, word_meta
from moviewords_pipeline.signatures_ext import extend_signatures

ROOT = Path(__file__).resolve().parent.parent / "webdata"
IN, OUT = ROOT / "in", ROOT / "out"


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.sql(f"CREATE VIEW movies AS SELECT * FROM '{IN / 'movies.parquet'}'")
    con.sql(f"CREATE VIEW words_by_movie AS SELECT * FROM '{IN / 'words_by_movie.parquet'}'")
    con.sql(f"CREATE VIEW word_year AS SELECT * FROM '{IN / 'word_year.parquet'}'")
    return con


def build_full_meta(con):
    """[(word, count, movie_count)] plus {word: (zipf, classes, pos, dist)}."""
    rows = con.sql("""
        SELECT word, SUM(count)::BIGINT AS c, COUNT(DISTINCT imdb_id) AS mc
        FROM words_by_movie GROUP BY word ORDER BY c DESC
    """).fetchall()
    return rows, word_meta({w: c for w, c, _ in rows})


def load_meta_parquet(con):
    rows = con.sql(f"SELECT word, zipf, classes, pos, dist FROM '{OUT / 'word_meta.parquet'}'").fetchall()
    return {w: (z, c, p, d) for w, z, c, p, d in rows}


def stage_meta(con):
    rows, meta = build_full_meta(con)
    con.sql("CREATE TABLE wm (word VARCHAR, zipf DOUBLE, classes VARCHAR, pos VARCHAR, dist DOUBLE)")
    con.executemany("INSERT INTO wm VALUES (?, ?, ?, ?, ?)",
                    [(w, *meta[w]) for w, _, _ in rows])
    con.sql(f"COPY (SELECT * FROM wm ORDER BY word) TO '{OUT / 'word_meta.parquet'}' (FORMAT parquet)")

    stop = load_stopwords()
    (OUT / "json").mkdir(parents=True, exist_ok=True)
    (OUT / "json" / "leaderboard-default.json").write_text(json.dumps({
        "words": [[w, c, mc, *meta[w]] for w, c, mc in rows if w not in stop][:1000],
        "stopwords": [[w, c, mc, *meta[w]] for w, c, mc in rows if w in stop][:50],
    }))


def stage_movies(con):
    """Streaming re-derive of every per-movie JSON with pos-tagged word rows.
    One pass over the (imdb_id, count DESC)-sorted parquet — never per-movie
    queries (see docs/ARCHITECTURE.md on the sort-order contract).
    """
    meta = load_meta_parquet(con)
    stop = load_stopwords()
    corpus = dict(con.sql("SELECT word, SUM(count) FROM words_by_movie GROUP BY word").fetchall())
    n_corpus = sum(corpus.values())
    movie_cols = ["imdb_id", "title", "year", "total_words", "unique_words", "words_per_minute"]
    movies = {r[0]: dict(zip(movie_cols, r)) for r in
              con.sql(f"SELECT {', '.join(movie_cols)} FROM movies").fetchall()}
    (OUT / "json" / "movie").mkdir(parents=True, exist_ok=True)

    def tag(word, value):
        z, cls, pos, _ = meta.get(word, (0.0, "x", "x", 0.0))
        return [word, value, z, cls, pos]

    def flush(imdb_id, rows):
        m = movies.get(imdb_id)
        if m is None:
            return
        payload = {
            "imdb_id": m["imdb_id"], "title": m["title"], "year": m["year"],
            "stats": {"total_words": m["total_words"], "unique_words": m["unique_words"],
                      "words_per_minute": m["words_per_minute"]},
            "top": [tag(w, c) for w, c in rows if w not in stop][:200],
            "top_all": [tag(w, c) for w, c in rows][:50],
            "distinctive": [tag(w, round(z, 2))
                            for w, z in log_odds(dict(rows), corpus, n_corpus=n_corpus)[:50]],
        }
        (OUT / "json" / "movie" / f"{imdb_id}.json").write_text(json.dumps(payload))

    cur = con.execute(f"SELECT imdb_id, word, count FROM '{IN / 'words_by_movie.parquet'}'")
    current, rows, n = None, [], 0
    while batch := cur.fetchmany(1_000_000):
        for imdb_id, word, count in batch:
            if imdb_id != current:
                if current is not None:
                    flush(current, rows)
                    n += 1
                current, rows = imdb_id, []
            rows.append((word, count))
    if current is not None:
        flush(current, rows)
        n += 1
    print(f"  wrote {n} movie JSONs")


def stage_boards(con):
    out = OUT / "json" / "leaderboards"
    out.mkdir(parents=True, exist_ok=True)
    meta = load_meta_parquet(con)

    def quality(word):
        # drop OCR junk: unknown-POS words that everyday English barely knows
        zipf, _, pos, _ = meta.get(word, (0.0, "x", "x", 0.0))
        return pos in "nvar" or zipf >= 4.0

    (out / "shifts.json").write_text(json.dumps(
        boards.risers_fallers(con, quality=quality)))
    (out / "films.json").write_text(json.dumps(
        boards.film_superlatives(con, load_profanity())))
    (out / "wonders.json").write_text(json.dumps(boards.one_film_wonders(con)))
    (out / "everywhere.json").write_text(json.dumps(
        boards.ubiquity(con, exclude=load_stopwords())))


def stage_signatures(con):
    profanity = load_profanity()
    out = OUT / "json" / "signature"
    out.mkdir(parents=True, exist_ok=True)
    for kind in ("decades", "genres"):
        sig = json.loads((IN / "signature" / f"{kind}.json").read_text())
        (out / f"{kind}.json").write_text(
            json.dumps(extend_signatures(con, sig, kind, profanity)))


STAGES = {"meta": stage_meta, "movies": stage_movies,
          "boards": stage_boards, "signatures": stage_signatures}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all", choices=["all", *STAGES])
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in STAGES if args.stage == "all" else [args.stage]:
        t0 = time.time()
        print(f"stage {name}…", flush=True)
        STAGES[name](connect())
        print(f"stage {name} done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
