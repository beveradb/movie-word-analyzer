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


def test_load_blocklist_parses_ids_and_pairs(tmp_path, monkeypatch):
    from moviewords_pipeline import corpus_index
    bl = tmp_path / "mislabeled_subs.txt"
    bl.write_text(
        "# comment line\n"
        "\n"
        "tt0000001\n"
        "tt0149624 OpenSubtitles/raw/en/2000/149624/267165.xml LOTR sub\n"
    )
    monkeypatch.setattr(corpus_index, "BLOCKLIST_PATH", bl)
    ids, pairs = corpus_index.load_blocklist()
    assert ids == {"tt0000001"}
    assert pairs == {("tt0149624", "OpenSubtitles/raw/en/2000/149624/267165.xml")}


def test_blocklist_skips_file_and_film(tmp_path, monkeypatch):
    """A blocked zip_name falls through to the next-best candidate; a blocked
    imdb_id drops the film from the index entirely."""
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq
    import zipfile

    from moviewords_pipeline import config, corpus_index

    raw = tmp_path / "raw"; raw.mkdir()
    work = tmp_path / "work"; work.mkdir()
    monkeypatch.setattr(config, "RAW_DIR", raw)
    monkeypatch.setattr(config, "WORK_DIR", work)

    body = b'<?xml version="1.0" encoding="utf-8"?><document id="1">' \
           + b'<s id="1">hello there general kenobi today</s>' * 800 \
           + b"</document>"
    small = b'<?xml version="1.0" encoding="utf-8"?><document id="1">' \
            + b'<s id="1">hello there general kenobi today</s>' * 600 \
            + b"</document>"
    with zipfile.ZipFile(raw / "opus_en.zip", "w") as z:
        z.writestr("OpenSubtitles/raw/en/2000/1000001/9.xml", body)   # best
        z.writestr("OpenSubtitles/raw/en/2000/1000001/8.xml", small)  # runner-up
        z.writestr("OpenSubtitles/raw/en/2001/1000002/7.xml", body)

    pq.write_table(
        pa.table({"imdb_id": ["tt1000001", "tt1000002"],
                  "runtime_minutes": [90, 90]}),
        str(work / "curated.parquet"))

    bl = tmp_path / "bl.txt"
    bl.write_text("tt1000002\n"
                  "tt1000001 OpenSubtitles/raw/en/2000/1000001/9.xml\n")
    monkeypatch.setattr(corpus_index, "BLOCKLIST_PATH", bl)

    corpus_index.run()
    rows = dict(duckdb.sql(
        f"SELECT imdb_id, zip_name FROM '{work / 'corpus_index.parquet'}'"
    ).fetchall())
    assert rows == {"tt1000001": "OpenSubtitles/raw/en/2000/1000001/8.xml"}
