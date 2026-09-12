from moviewords_pipeline.word_meta2 import distinctiveness, dominant_pos


def test_dominant_pos_common_verb():
    # 'know' has an obscure WordNet noun sense; sense counts must pick verb
    assert dominant_pos("know") == "v"


def test_dominant_pos_noun():
    assert dominant_pos("war") == "n"


def test_dominant_pos_adjective():
    assert dominant_pos("beautiful") == "a"


def test_dominant_pos_adverb():
    assert dominant_pos("quickly") == "r"


def test_dominant_pos_unknown_words_are_x():
    assert dominant_pos("uh") == "x"
    assert dominant_pos("yippeekiyay") == "x"


def test_distinctiveness_overrepresented():
    # corpus rate 100/M vs zipf 4.0 (= 10/M in general English): log2(10) = 3.32
    assert distinctiveness(100.0, 4.0) == 3.32


def test_distinctiveness_underrepresented():
    assert distinctiveness(1.0, 4.0) == -3.32


def test_distinctiveness_zipf_floor():
    # zipf 0 (unknown to wordfreq) is floored to 1.0 → 0.01/M; rate 1/M → log2(100)
    assert distinctiveness(1.0, 0.0) == 6.64
