import json

import duckdb
import pytest

from moviewords_pipeline import config, corpus_index, counts, curate, derive
from tests.fixtures.make_mini_corpus import build as build_zip
from pathlib import Path

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def data_tree(tmp_path, monkeypatch):
    for name in ("RAW_DIR", "WORK_DIR", "OUT_DIR"):
        monkeypatch.setattr(config, name, tmp_path / name.split("_")[0].lower())
        getattr(config, name).mkdir(parents=True)
    return tmp_path


def test_full_pipeline_on_fixture_corpus(data_tree, monkeypatch):
    # download stage stand-in: place fixtures where stages expect them
    build_zip(config.RAW_DIR / "opus_en.zip")
    (config.RAW_DIR / "title.basics.tsv.gz").write_bytes(
        (FIX / "mini.basics.tsv.gz").read_bytes())
    (config.RAW_DIR / "title.ratings.tsv.gz").write_bytes(
        (FIX / "mini.ratings.tsv.gz").read_bytes())
    # fixture TMDB cache instead of network
    tmdb_dir = config.WORK_DIR / "tmdb"
    tmdb_dir.mkdir(parents=True)
    (tmdb_dir / "tt0110912.json").write_text(json.dumps(
        {"imdb_id": "tt0110912", "countries": ["US"], "original_language": "en"}))

    curate.run()
    corpus_index.run()
    counts.run()
    derive.run()

    movies = duckdb.sql(f"SELECT * FROM '{config.OUT_DIR / 'movies.parquet'}'").df()
    assert list(movies.imdb_id) == ["tt0110912"]  # only curated+enriched english film
    hot = json.loads((config.OUT_DIR / "json" / "movie" / "tt0110912.json").read_text())
    assert hot["stats"]["total_words"] > 0
    assert (config.OUT_DIR / "json" / "leaderboard-default.json").exists()
    assert (config.OUT_DIR / "report.md").exists()
    wy = duckdb.sql(f"SELECT * FROM '{config.OUT_DIR / 'word_year.parquet'}'").df()
    assert set(wy.columns) == {"word", "year", "count", "movie_count"}
