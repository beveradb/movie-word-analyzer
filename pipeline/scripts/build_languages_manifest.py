"""Emit all/json/languages.json - the corpus-filter manifest: the languages
with >= MIN_FILMS films (cn+zh merged into zh), sorted by film count.

  uv run python scripts/build_languages_manifest.py
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402

from moviewords_pipeline import config  # noqa: E402

MIN_FILMS = 100
MERGE = {"cn": "zh"}  # TMDB splits Chinese; fold cn into zh


def build(movies_parquet: Path, dest: Path, min_films: int = MIN_FILMS) -> list[dict]:
    rows = duckdb.sql(
        f"SELECT original_language AS lang, COUNT(*) AS n FROM '{movies_parquet}' GROUP BY 1"
    ).fetchall()
    counts: dict[str, int] = {}
    for lang, n in rows:
        if lang is None:
            continue
        code = MERGE.get(lang, lang)
        counts[code] = counts.get(code, 0) + n
    opts = [{"code": c, "films": n} for c, n in counts.items() if n >= min_films]
    opts.sort(key=lambda o: (-o["films"], o["code"]))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(opts))
    return opts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--webdata", default=str(Path(__file__).resolve().parent.parent / "webdata"))
    args = ap.parse_args()
    root = Path(args.webdata)
    opts = build(root / "in" / "all" / "movies.parquet",
                 root / "out" / "all" / "json" / "languages.json")
    print(f"wrote {len(opts)} language options")


if __name__ == "__main__":
    main()
