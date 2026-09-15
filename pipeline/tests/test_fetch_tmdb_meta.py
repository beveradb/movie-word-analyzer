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


def test_build_parquet_mixed_nested_shapes(tmp_path):
    """A film whose nested list columns (cast/keywords/director) are empty must
    not break schema inference for a later film that populates them — the flat
    parquet must still carry the populated nested values as typed list<struct>.
    (At corpus scale, empty-in-the-sample-but-populated-later is what forced the
    read_json_auto sample_size=-1 fix.)"""
    cache = tmp_path / "tmdb_meta"
    cache.mkdir()
    # first (sorts first): everything empty/absent
    (cache / "tt0000001.json").write_text(json.dumps({"id": 1, "overview": "a"}))
    # second: populated nested lists/structs
    (cache / "tt0000009.json").write_text(json.dumps({
        "id": 9, "overview": "b",
        "genres": [{"name": "Drama"}],
        "keywords": {"keywords": [{"name": "heist"}]},
        "credits": {"cast": [{"name": "Someone", "character": "Lead", "order": 0}],
                    "crew": [{"name": "A Director", "job": "Director"}]},
    }))
    out = tmp_path / "tmdb_meta.parquet"

    rows = mod.build_parquet(cache, out)

    assert rows == 2
    empty, full = duckdb.sql(
        f'SELECT tmdb_genres, keywords, director, "cast" FROM \'{out}\' ORDER BY imdb_id'
    ).fetchall()
    assert empty == ([], [], [], [])
    assert full[0] == ["Drama"] and full[1] == ["heist"] and full[2] == ["A Director"]
    assert full[3][0]["name"] == "Someone"
