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


def test_dominant_pos_inflected_forms_resolve_to_verb():
    # 'going' must inherit go.v's sense counts via morphy, not going.n's
    assert dominant_pos("going") == "v"
    assert dominant_pos("got") == "v"


def test_dominant_pos_abbreviation_collisions_are_x():
    # WordNet only knows these as abbreviations (Ohio, United States) with zero
    # sense counts; as common dialogue words they must not be classed nouns
    assert dominant_pos("oh", zipf=6.0) == "x"
    assert dominant_pos("us", zipf=6.0) == "x"


def test_dominant_pos_interjections_are_x():
    assert dominant_pos("yes", zipf=6.2) == "x"
    assert dominant_pos("hello", zipf=5.5) == "x"


def test_dominant_pos_rare_word_falls_back_to_first_synset():
    # zero sense counts + rare: trust WordNet's first-listed synset
    assert dominant_pos("sheriff", zipf=4.2) == "n"


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
