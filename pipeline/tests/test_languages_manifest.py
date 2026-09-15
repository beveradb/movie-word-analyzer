import json
from pathlib import Path

import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401


def test_manifest_merges_chinese_and_applies_floor(tmp_path):
    from build_languages_manifest import build
    p = tmp_path / "movies.parquet"
    con = duckdb.connect()
    # es: 3, zh: 2, cn: 2 (=> Chinese 4), fr: 1 (below floor of 2)
    con.sql(f"""
        COPY (SELECT * FROM (VALUES
            ('a','es'),('b','es'),('c','es'),
            ('d','zh'),('e','zh'),('f','cn'),('g','cn'),
            ('h','fr')
        ) t(imdb_id, original_language))
        TO '{p}' (FORMAT parquet)
    """)
    dest = tmp_path / "languages.json"
    opts = build(p, dest, min_films=2)
    assert {o["code"] for o in opts} == {"es", "zh"}   # fr dropped, cn folded into zh
    by = {o["code"]: o["films"] for o in opts}
    assert by == {"zh": 4, "es": 3}
    assert opts[0]["code"] == "zh"  # sorted by films desc
    assert json.loads(dest.read_text()) == opts
