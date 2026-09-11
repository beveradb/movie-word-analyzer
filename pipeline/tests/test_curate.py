from pathlib import Path

from moviewords_pipeline.curate import build_curated

FIX = Path(__file__).parent / "fixtures"


def test_keeps_only_voted_movies():
    rel = build_curated(FIX / "mini.basics.tsv.gz", FIX / "mini.ratings.tsv.gz", 1000)
    rows = {r[0]: r for r in rel.fetchall()}
    assert set(rows) == {"tt0110912"}  # short, tvSeries, low-votes all dropped


def test_schema():
    rel = build_curated(FIX / "mini.basics.tsv.gz", FIX / "mini.ratings.tsv.gz", 1000)
    assert rel.columns == ["imdb_id", "title", "year", "runtime_minutes",
                           "genres", "rating", "votes"]
