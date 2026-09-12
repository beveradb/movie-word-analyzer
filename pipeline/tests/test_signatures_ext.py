import duckdb
import pytest

from moviewords_pipeline.signatures_ext import extend_signatures


@pytest.fixture
def con():
    con = duckdb.connect()
    con.sql("""
        CREATE TABLE movies (imdb_id VARCHAR, year INT, genres VARCHAR[],
                             total_words BIGINT);
        INSERT INTO movies VALUES
            ('tt1', 1994, ['Comedy'], 60),
            ('tt2', 1996, ['Comedy', 'Horror'], 40),
            ('tt3', 2015, ['Horror'], 500);

        CREATE TABLE words_by_movie (imdb_id VARCHAR, word VARCHAR, count BIGINT);
        INSERT INTO words_by_movie VALUES
            ('tt1', 'hello', 50), ('tt1', 'fuck', 10),
            ('tt2', 'hello', 30), ('tt2', 'ring', 10),
            ('tt3', 'scream', 400), ('tt3', 'fuck', 100);
    """)
    return con


def test_extend_decades_adds_stats_and_top_words(con):
    sig = {
        "1990": {"movie_count": 2, "total_words": 100, "top": [], "signature": []},
        "2010": {"movie_count": 1, "total_words": 500, "top": [], "signature": []},
    }
    out = extend_signatures(con, sig, "decades", profanity={"fuck"})
    nineties = out["1990"]
    assert nineties["movie_count"] == 2  # existing keys preserved
    assert nineties["unique_words"] == 3  # hello, fuck, ring
    assert nineties["swears_per_1k"] == 100.0  # 10 / 100 words * 1000
    assert nineties["top_words"][0] == ["hello", 80]
    assert out["2010"]["swears_per_1k"] == 200.0
    assert out["2010"]["top_words"][0] == ["scream", 400]


def test_extend_genres_unnests_membership(con):
    sig = {
        "Comedy": {"movie_count": 2, "total_words": 100, "top": [], "signature": []},
        "Horror": {"movie_count": 2, "total_words": 540, "top": [], "signature": []},
    }
    out = extend_signatures(con, sig, "genres", profanity={"fuck"})
    # Horror = tt2 + tt3: hello 30, ring 10, scream 400, fuck 100
    horror = out["Horror"]
    assert horror["unique_words"] == 4
    assert horror["top_words"][0] == ["scream", 400]
    assert horror["swears_per_1k"] == round(100 / 540 * 1000, 2)
