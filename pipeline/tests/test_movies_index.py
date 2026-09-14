import json

import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401  (see step 2)


def test_build_movies_index(tmp_path):
    from build_movies_index import build
    src = tmp_path / "movies.parquet"
    duckdb.sql("""
        SELECT * FROM (VALUES
            ('tt1', 'Big Hit', 1999, 8.1, 900000, 12000, 3000,
             ['Drama'], 'en'),
            ('tt2', 'Petit Film', 2001, 7.0, 450, 6000, 2000,
             ['Comedy'], 'fr')
        ) t(imdb_id, title, year, rating, votes, total_words, unique_words,
            genres, original_language)
    """).write_parquet(str(src))
    dest = tmp_path / "json" / "movies-index.json"
    n = build(src, dest)
    assert n == 2
    idx = json.loads(dest.read_text())
    assert [m["id"] for m in idx] == ["tt1", "tt2"]  # votes DESC
    assert idx[1] == {"id": "tt2", "title": "Petit Film", "year": 2001,
                      "rating": 7.0, "votes": 450, "total_words": 6000,
                      "unique_words": 2000, "genres": ["Comedy"], "lang": "fr"}
