import importlib.util
import json
from pathlib import Path

import duckdb

SPEC = importlib.util.spec_from_file_location(
    "fetch_tmdb_meta",
    Path(__file__).resolve().parents[1] / "scripts" / "fetch_tmdb_meta.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def test_build_parquet_from_raw_cache(tmp_path):
    cache = tmp_path / "tmdb_meta"
    cache.mkdir()
    (cache / "tt0137523.json").write_text(json.dumps({
        "id": 550, "overview": "o", "tagline": "t", "runtime": 139,
        "genres": [{"name": "Drama"}],
        "keywords": {"keywords": [{"name": "nihilism"}]},
        "credits": {"cast": [{"name": "Edward Norton", "character": "N", "order": 0}],
                    "crew": [{"name": "David Fincher", "job": "Director"}]},
    }))
    (cache / "tt0000002.json").write_text(json.dumps(None))  # no-match: skipped
    out = tmp_path / "tmdb_meta.parquet"

    rows = mod.build_parquet(cache, out)

    assert rows == 1
    got = duckdb.sql(f"SELECT imdb_id, tmdb_id, tmdb_genres, keywords, director, "
                     f'"cast" FROM \'{out}\'').fetchall()
    assert got[0][0] == "tt0137523"
    assert got[0][1] == 550
    assert got[0][2] == ["Drama"]
    assert got[0][3] == ["nihilism"]
    assert got[0][4] == ["David Fincher"]
    assert got[0][5][0]["name"] == "Edward Norton"
