import json
import os
import time

import duckdb
import requests

from . import config

BASE = "https://api.themoviedb.org/3"


def lookup(imdb_id, session):
    found = session.get(f"{BASE}/find/{imdb_id}",
                        params={"external_source": "imdb_id"}, timeout=30)
    found.raise_for_status()
    results = found.json().get("movie_results", [])
    if not results:
        return None
    detail = session.get(f"{BASE}/movie/{results[0]['id']}", timeout=30)
    detail.raise_for_status()
    data = detail.json()
    return {"imdb_id": imdb_id,
            "countries": [c["iso_3166_1"] for c in data.get("production_countries", [])],
            "original_language": data.get("original_language")}


def run():
    cache = config.WORK_DIR / "tmdb"
    cache.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {os.environ['TMDB_API_TOKEN']}"
    ids = [r[0] for r in duckdb.sql(
        f"SELECT imdb_id FROM '{config.WORK_DIR / 'corpus_index.parquet'}'").fetchall()]
    done = failed = 0
    for imdb_id in ids:
        dest = cache / f"{imdb_id}.json"
        if dest.exists():
            continue
        try:
            record = lookup(imdb_id, session)
        except requests.RequestException as exc:
            print(f"tmdb {imdb_id}: {exc}")
            failed += 1
            continue
        dest.write_text(json.dumps(record))  # 'null' for no-match: cached too
        done += 1
        time.sleep(0.05)  # ~20 req/s, well under TMDB limits
    print(f"enrich stage: fetched={done} failed={failed} total={len(ids)}")
