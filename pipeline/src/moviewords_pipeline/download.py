import requests

from . import config


def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(".part")
    with requests.get(url, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        with open(part, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    part.rename(dest)
    return dest


def run():
    fetch(config.OPUS_URL, config.RAW_DIR / "opus_en.zip")
    fetch(config.IMDB_BASICS_URL, config.RAW_DIR / "title.basics.tsv.gz")
    fetch(config.IMDB_RATINGS_URL, config.RAW_DIR / "title.ratings.tsv.gz")
