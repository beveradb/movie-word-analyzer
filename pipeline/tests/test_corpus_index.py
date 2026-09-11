from moviewords_pipeline.corpus_index import imdb_id_from_path, select_best


def test_imdb_id_from_path():
    assert imdb_id_from_path("OpenSubtitles/raw/en/1994/110912/1.xml") == "tt0110912"
    assert imdb_id_from_path("OpenSubtitles/raw/en/2020/13320622/9.xml") == "tt13320622"
    assert imdb_id_from_path("OpenSubtitles/raw/en/1994/110912/") is None


def test_select_best_prefers_largest_in_band():
    # runtime 100 min -> plausible 2,000..25,000 tokens
    cands = [("a.xml", 500), ("b.xml", 9_000), ("c.xml", 14_000), ("d.xml", 400_000)]
    assert select_best(cands, 100) == "c.xml"


def test_select_best_none_when_all_outside_band():
    assert select_best([("a.xml", 10)], 100) is None


def test_select_best_uses_fallback_range_without_runtime():
    assert select_best([("a.xml", 5_000), ("b.xml", 100_000)], None) == "a.xml"


def test_select_best_none_for_empty_candidates():
    assert select_best([], 100) is None
