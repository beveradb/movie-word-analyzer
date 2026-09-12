import duckdb
import pytest

from moviewords_pipeline.boards import (
    film_superlatives,
    one_film_wonders,
    risers_fallers,
    ubiquity,
)


@pytest.fixture
def con():
    con = duckdb.connect()
    con.sql("""
        CREATE TABLE movies (imdb_id VARCHAR, title VARCHAR, year INT,
            runtime_minutes INT, total_words BIGINT, unique_words BIGINT,
            words_per_minute DOUBLE);
        INSERT INTO movies VALUES
            ('tt1', 'Fast Talker', 1994, 100, 12000, 3000, 120.0),
            ('tt2', 'Slow Burn',   2001, 100,  6000, 2400,  60.0),
            ('tt3', 'Sweary Song', 2010, 100,  8000,  800,  80.0);

        CREATE TABLE words_by_movie (imdb_id VARCHAR, word VARCHAR, count BIGINT);
        INSERT INTO words_by_movie VALUES
            ('tt1', 'hello', 50), ('tt1', 'fuck', 10), ('tt1', 'wilson', 5),
            ('tt2', 'hello', 40), ('tt2', 'ring', 12),
            ('tt3', 'hello', 30), ('tt3', 'fuck', 400), ('tt3', 'wilson', 495);

        CREATE TABLE word_year (word VARCHAR, year INT, count BIGINT);
        INSERT INTO word_year
        SELECT 'phone', y, CASE WHEN y >= 2010 THEN 90 ELSE 10 END
          FROM UNNEST([1935, 1945, 1955, 1965, 2015, 2025]) AS t(y)
        UNION ALL
        SELECT 'telegram', y, CASE WHEN y < 1950 THEN 90 ELSE 10 END
          FROM UNNEST([1935, 1945, 1955, 1965, 2015, 2025]) AS t(y)
        UNION ALL
        SELECT 'steady', y, 100
          FROM UNNEST([1935, 1945, 1955, 1965, 2015, 2025]) AS t(y);
    """)
    return con


def test_risers_and_fallers_ordering(con):
    out = risers_fallers(con, min_total=100, min_decades=6, top_n=3)
    assert out["risers"][0]["word"] == "phone"
    assert out["fallers"][0]["word"] == "telegram"
    assert out["risers"][0]["score"] > 0 > out["fallers"][0]["score"]
    # per-decade rates ship with each row for sparklines
    decades = [d for d, _ in out["risers"][0]["rates"]]
    assert decades == out["decades"] == [1930, 1940, 1950, 1960, 2010, 2020]


def test_risers_fallers_respects_min_total(con):
    out = risers_fallers(con, min_total=10_000, min_decades=6)
    assert out["risers"] == [] and out["fallers"] == []


def test_film_superlatives(con):
    out = film_superlatives(con, profanity={"fuck"}, min_words=5000)
    assert out["chattiest"][0]["id"] == "tt1"
    assert out["vocabulary"][0]["id"] == "tt1"
    assert out["sweariest"][0]["id"] == "tt3"
    assert out["sweariest"][0]["value"] == 50.0  # 400 swears / 8000 words * 1000
    assert out["repetitive"][0]["id"] == "tt3"  # 800/8000 = lowest uniqueness


def test_one_film_wonders(con):
    out = one_film_wonders(con, min_top=400, min_films=2)
    words = [r["word"] for r in out]
    assert "wilson" in words  # 495 vs 5 elsewhere: dominant
    assert "hello" not in words  # spread across films
    wilson = next(r for r in out if r["word"] == "wilson")
    assert wilson["id"] == "tt3" and wilson["share"] == 0.99


def test_one_film_wonders_min_films_kills_ocr_junk(con):
    # wilson drops to a single film: below the min_films floor
    con.sql("DELETE FROM words_by_movie WHERE word = 'wilson' AND imdb_id = 'tt1'")
    out = one_film_wonders(con, min_top=400, min_films=3)
    assert all(r["word"] != "wilson" for r in out)


def test_one_film_wonders_rejects_short_or_vowelless_words(con):
    con.sql("""
        INSERT INTO words_by_movie
        SELECT imdb_id, 'yy', 300 FROM (VALUES ('tt1'), ('tt2'), ('tt3')) t(imdb_id)
        UNION ALL
        SELECT 'tt3', 'zz', 900
    """)
    out = one_film_wonders(con, min_top=100, min_films=2)
    assert all(r["word"] not in ("yy", "zz") for r in out)


def test_risers_fallers_quality_predicate(con):
    out = risers_fallers(con, min_total=100, min_decades=6,
                         quality=lambda w: w != "phone")
    assert all(r["word"] != "phone" for r in out["risers"])


def test_ubiquity(con):
    out = ubiquity(con, top_n=2)
    assert out[0]["word"] == "hello"
    assert out[0]["films"] == 3
    assert out[0]["share"] == 1.0


def test_ubiquity_excludes_stopwords(con):
    out = ubiquity(con, top_n=2, exclude={"hello"})
    assert all(r["word"] != "hello" for r in out)
