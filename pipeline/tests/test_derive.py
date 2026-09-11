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
