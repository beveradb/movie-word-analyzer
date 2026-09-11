from moviewords_pipeline.wordcount import count_words, tokenize


def test_tokenize_lowercases_and_keeps_contractions():
    assert tokenize("Don't stop ME now!") == ["don't", "stop", "me", "now"]


def test_tokenize_strips_wrapping_quotes_and_numbers():
    assert tokenize("'tis 42 the 'best' day") == ["'tis", "the", "best", "day"]


def test_count_words():
    counts = count_words("the cat and the hat")
    assert counts["the"] == 2 and counts["cat"] == 1
