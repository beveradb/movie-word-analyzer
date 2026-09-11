from moviewords_pipeline.wordcount import count_words, tokenize


def test_tokenize_lowercases_and_keeps_contractions():
    assert tokenize("Don't stop ME now!") == ["don't", "stop", "me", "now"]


def test_tokenize_strips_wrapping_quotes_and_numbers():
    assert tokenize("'tis 42 the 'best' day") == ["'tis", "the", "best", "day"]


def test_count_words():
    counts = count_words("the cat and the hat")
    assert counts["the"] == 2 and counts["cat"] == 1


def test_tokenize_normalizes_curly_apostrophes():
    assert tokenize("don’t stop") == ["don't", "stop"]


def test_tokenize_strips_multi_word_quote_pairs():
    assert tokenize("she said 'no way' to him") == [
        "she",
        "said",
        "no",
        "way",
        "to",
        "him",
    ]


def test_tokenize_keeps_unpaired_leading_elision():
    assert tokenize("'tis the season") == ["'tis", "the", "season"]


def test_tokenize_normalizes_accented_letters():
    assert tokenize("café naïve") == ["cafe", "naive"]
