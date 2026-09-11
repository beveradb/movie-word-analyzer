import duckdb

from moviewords_pipeline.counts import build
from tests.fixtures.make_mini_corpus import build as build_zip

INDEX = [("tt0110912", "OpenSubtitles/raw/en/1994/110912/1.xml"),
         ("tt9999999", "OpenSubtitles/raw/en/2001/9999999/3.xml")]
RUNTIMES = {"tt0110912": 154, "tt9999999": 90}


def test_build_counts_and_stats(tmp_path):
    zip_path = build_zip(tmp_path / "mini.zip")
    out_c, out_s = tmp_path / "wc.parquet", tmp_path / "ms.parquet"
    report = build(zip_path, INDEX, tmp_path / "cache", out_c, out_s, RUNTIMES)
    assert report == {"processed": 2, "skipped": 0, "failed": 0}
    wc = duckdb.sql(f"SELECT * FROM '{out_c}'").df()
    pulp = wc[wc.imdb_id == "tt0110912"]
    assert int(pulp[pulp.word == "cheese"]["count"].iloc[0]) == 400  # 2 lines x200
    ms = duckdb.sql(f"SELECT * FROM '{out_s}' ORDER BY imdb_id").df()
    assert list(ms.imdb_id) == ["tt0110912", "tt9999999"]
    assert ms.iloc[0].total_words == pulp["count"].sum()


def test_rerun_skips_cached_movies(tmp_path):
    zip_path = build_zip(tmp_path / "mini.zip")
    args = (tmp_path / "cache", tmp_path / "wc.parquet", tmp_path / "ms.parquet")
    build(zip_path, INDEX, *args, RUNTIMES)
    report = build(zip_path, INDEX, *args, RUNTIMES)
    assert report == {"processed": 0, "skipped": 2, "failed": 0}
    # compaction still produced full outputs from cache
    n = duckdb.sql(f"SELECT COUNT(DISTINCT imdb_id) FROM '{args[1]}'").fetchone()[0]
    assert n == 2


def test_changed_zip_name_invalidates_cache_entry(tmp_path):
    zip_path = build_zip(tmp_path / "mini.zip")
    args = (tmp_path / "cache", tmp_path / "wc.parquet", tmp_path / "ms.parquet")
    build(zip_path, INDEX, *args, RUNTIMES)
    new_index = [("tt0110912", "OpenSubtitles/raw/en/1994/110912/2.xml"), INDEX[1]]
    report = build(zip_path, new_index, *args, RUNTIMES)
    assert report == {"processed": 1, "skipped": 1, "failed": 0}


def test_unparseable_file_is_skipped_not_fatal_and_not_cached(tmp_path):
    import zipfile
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr("OpenSubtitles/raw/en/1994/110912/1.xml", b"<broken")
    args = (tmp_path / "cache", tmp_path / "wc.parquet", tmp_path / "ms.parquet")
    report = build(zip_path, [INDEX[0]], *args, runtimes={})
    assert report == {"processed": 0, "skipped": 0, "failed": 1}
    assert not (tmp_path / "cache" / "tt0110912.json").exists()
