"""Build one language's scoped input tree from the published all/ parquets, so
the existing rebuild_web_data stages can bake per-language aggregates. See
docs/superpowers/specs/2026-09-14-corpus-language-filter-design.md.

  uv run python scripts/build_lang_slice.py --lang es
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402

from moviewords_pipeline.derive import build_signature_base  # noqa: E402

# The only option built from two TMDB codes; every other option is single-code.
CODES = {"zh": ["zh", "cn"]}


def build_slice(all_in: Path, out_in: Path, codes: list[str]) -> int:
    out_in.mkdir(parents=True, exist_ok=True)
    (out_in / "signature").mkdir(parents=True, exist_ok=True)
    in_list = ", ".join(f"'{c}'" for c in codes)
    con = duckdb.connect()
    # words_by_movie is stored flat (words_by_movie.parquet) in the fetched
    # webdata/in tree - fetch_published.sh flattens the R2 words_by_movie/data.parquet
    # to match rebuild_web_data.connect()'s flat read.
    con.sql(f"""
        CREATE TABLE movies AS
            SELECT * FROM '{all_in}/movies.parquet'
            WHERE original_language IN ({in_list});
        CREATE TABLE wc AS
            SELECT w.* FROM '{all_in}/words_by_movie.parquet' w
            WHERE w.imdb_id IN (SELECT imdb_id FROM movies);
    """)
    con.sql(f"COPY movies TO '{out_in}/movies.parquet' (FORMAT parquet)")
    con.sql(f"""
        COPY (SELECT * FROM wc ORDER BY imdb_id, count DESC)
        TO '{out_in}/words_by_movie.parquet' (FORMAT parquet)
    """)
    # word_year re-derived from the per-language word_year_lang: sum the selected
    # codes per (word, year), then re-apply the same per-word >=20 corpus floor
    # word_year.parquet uses so trend eligibility matches the whole-corpus rule.
    con.sql(f"""
        COPY (
            SELECT word, year, SUM(count)::BIGINT AS count,
                   SUM(movie_count)::BIGINT AS movie_count
            FROM '{all_in}/word_year_lang.parquet'
            WHERE lang IN ({in_list})
            GROUP BY word, year
            QUALIFY SUM(SUM(count)) OVER (PARTITION BY word) >= 20
            ORDER BY word, year
        ) TO '{out_in}/word_year.parquet' (FORMAT parquet)
    """)
    base = build_signature_base(con)
    for kind, payload in base.items():
        (out_in / "signature" / f"{kind}.json").write_text(json.dumps(payload))
    return con.sql("SELECT COUNT(*) FROM movies").fetchone()[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", required=True)
    ap.add_argument("--webdata", default=str(Path(__file__).resolve().parent.parent / "webdata"))
    args = ap.parse_args()
    root = Path(args.webdata)
    codes = CODES.get(args.lang, [args.lang])
    n = build_slice(root / "in" / "all", root / "in" / "all" / "lang" / args.lang, codes)
    print(f"wrote {n} films for lang {args.lang} ({'+'.join(codes)})")


if __name__ == "__main__":
    main()
