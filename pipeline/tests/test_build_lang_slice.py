import json
from pathlib import Path

import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401


def _make_all_inputs(root: Path):
    """Two es films, one en film, plus word_year_lang covering them."""
    (root / "words_by_movie").mkdir(parents=True)
    con = duckdb.connect()
    con.sql(f"""
        COPY (SELECT * FROM (VALUES
            ('tt_es1','Amores',2000,['Drama'],'es',1000),
            ('tt_es2','Mar',2004,['Drama'],'es',1200),
            ('tt_en1','Heat',1995,['Crime'],'en',9000)
        ) t(imdb_id,title,year,genres,original_language,total_words))
        TO '{root}/movies.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES
            ('tt_es1','amor',40),('tt_es2','amor',60),('tt_en1','gun',50)
        ) t(imdb_id,word,count))
        TO '{root}/words_by_movie/data.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES
            ('amor',2000,'es',40,1),('amor',2004,'es',60,1),('gun',1995,'en',50,1)
        ) t(word,year,lang,count,movie_count))
        TO '{root}/word_year_lang.parquet' (FORMAT parquet);
    """)


def test_build_slice_filters_to_language(tmp_path):
    from build_lang_slice import build_slice
    all_in = tmp_path / "all"
    _make_all_inputs(all_in)
    out_in = tmp_path / "lang" / "es"
    n = build_slice(all_in, out_in, ["es"])
    assert n == 2

    movies = duckdb.sql(f"SELECT imdb_id, original_language FROM '{out_in}/movies.parquet'").fetchall()
    assert {m[0] for m in movies} == {"tt_es1", "tt_es2"}
    assert {m[1] for m in movies} == {"es"}

    wbm = duckdb.sql(f"SELECT DISTINCT imdb_id FROM '{out_in}/words_by_movie.parquet'").fetchall()
    assert {r[0] for r in wbm} == {"tt_es1", "tt_es2"}

    wy = duckdb.sql(f"SELECT word, year, count FROM '{out_in}/word_year.parquet' ORDER BY year").fetchall()
    assert wy == [("amor", 2000, 40), ("amor", 2004, 60)]

    sig = json.loads((out_in / "signature" / "decades.json").read_text())
    assert "2000" in sig  # both es films are in the 2000s decade


def test_chinese_merges_two_codes(tmp_path):
    from build_lang_slice import build_slice, CODES
    assert CODES["zh"] == ["zh", "cn"]
    all_in = tmp_path / "all"
    (all_in / "words_by_movie").mkdir(parents=True)
    con = duckdb.connect()
    con.sql(f"""
        COPY (SELECT * FROM (VALUES
            ('tt_zh','Hero',2002,['Action'],'zh',3000),
            ('tt_cn','IP',2008,['Action'],'cn',3200)
        ) t(imdb_id,title,year,genres,original_language,total_words))
        TO '{all_in}/movies.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES ('tt_zh','fight',20),('tt_cn','fight',22)) t(imdb_id,word,count))
        TO '{all_in}/words_by_movie/data.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES ('fight',2002,'zh',20,1),('fight',2008,'cn',22,1)) t(word,year,lang,count,movie_count))
        TO '{all_in}/word_year_lang.parquet' (FORMAT parquet);
    """)
    n = build_slice(all_in, tmp_path / "lang" / "zh", CODES["zh"])
    assert n == 2
    wy = duckdb.sql(f"SELECT word, SUM(count) FROM '{tmp_path}/lang/zh/word_year.parquet' GROUP BY word").fetchall()
    assert wy == [("fight", 42)]
