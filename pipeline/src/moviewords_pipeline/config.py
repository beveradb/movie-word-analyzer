from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
WORK_DIR = DATA_DIR / "work"
OUT_DIR = DATA_DIR / "out"

OPUS_URL = "https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2024/raw/en.zip"
IMDB_BASICS_URL = "https://datasets.imdbws.com/title.basics.tsv.gz"
IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz"

MIN_VOTES = 1000
# plausible spoken-word rate band used to reject bad subtitle files
MIN_TOKENS_PER_MIN = 20
MAX_TOKENS_PER_MIN = 250
FALLBACK_TOKEN_RANGE = (2_000, 40_000)  # when runtime unknown
