from moviewords_pipeline.derive import load_stopwords, log_odds


def test_stopwords_load():
    sw = load_stopwords()
    assert {"the", "and", "of"} <= sw
    assert len(sw) > 100


def test_log_odds_ranks_overrepresented_words_first():
    movie = {"cheese": 50, "the": 100}
    corpus = {"cheese": 60, "the": 100_000, "of": 50_000}
    ranked = log_odds(movie, corpus)
    assert ranked[0][0] == "cheese"
    assert ranked[0][1] > 0


def test_log_odds_ignores_rare_noise():
    movie = {"zzxq": 1, "cheese": 40}
    corpus = {"cheese": 500, "the": 100_000}
    ranked = dict(log_odds(movie, corpus, min_count=3))
    assert "zzxq" not in ranked


def test_word_meta_classes_and_zipf():
    from moviewords_pipeline.derive import word_meta
    meta = word_meta({"run": 500, "beautiful": 100, "jellicle": 400, "quickly": 50})
    zipf, classes, pos, dist = meta["run"]
    assert zipf > 4 and "n" in classes and "v" in classes
    assert pos == "v"  # dominant POS is single-valued
    assert "a" in meta["beautiful"][1]
    assert meta["jellicle"][1] == "x"  # not in WordNet -> name/other class
    assert meta["jellicle"][2] == "x"
    assert meta["jellicle"][3] > meta["run"][3]  # rarer word, similar rate → more movie-ish
    assert "r" in meta["quickly"][1]


def test_log_odds_precomputed_n_corpus_matches():
    movie = {"cheese": 50, "the": 100}
    corpus = {"cheese": 60, "the": 100_000, "of": 50_000}
    assert log_odds(movie, corpus) == log_odds(movie, corpus, n_corpus=150_060)


def test_run_rejects_unknown_corpus():
    import pytest

    from moviewords_pipeline import derive
    with pytest.raises(ValueError, match="unknown corpus"):
        derive.run(corpus="fr")


def test_build_signature_base_returns_decades_and_genres():
    import duckdb
    from moviewords_pipeline.derive import build_signature_base
    con = duckdb.connect()
    con.sql("""
        CREATE TABLE movies AS SELECT * FROM (VALUES
            ('tt1','A',1994, ['Crime']),
            ('tt2','B',1995, ['Crime','Drama'])
        ) t(imdb_id,title,year,genres);
        CREATE TABLE wc AS SELECT * FROM (VALUES
            ('tt1','heist',30),('tt1','gun',20),
            ('tt2','heist',10),('tt2','love',25)
        ) t(imdb_id,word,count);
    """)
    base = build_signature_base(con)
    assert set(base) == {"decades", "genres"}
    assert "1990" in base["decades"]
    assert "Crime" in base["genres"]
    entry = base["decades"]["1990"]
    assert entry["movie_count"] == 2
    assert entry["total_words"] > 0
    assert isinstance(entry["top"], list)
