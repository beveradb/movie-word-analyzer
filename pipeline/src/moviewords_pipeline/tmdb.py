import json
import os
import time

import duckdb
import requests

from . import config

BASE = "https://api.themoviedb.org/3"


def make_session():
    """Auth from env: TMDB_API_TOKEN (v4 bearer) or TMDB_API_KEY (v3 query param)."""
    session = requests.Session()
    token = os.environ.get("TMDB_API_TOKEN")
    key = os.environ.get("TMDB_API_KEY")
    if token:
        session.headers["Authorization"] = f"Bearer {token}"
    elif key:
        session.params = {"api_key": key}
    else:
        raise SystemExit("Set TMDB_API_TOKEN (v4 read token) or TMDB_API_KEY (v3 key)")
    return session


def lookup(imdb_id, session):
    found = session.get(f"{BASE}/find/{imdb_id}",
                        params={"external_source": "imdb_id"}, timeout=30)
    found.raise_for_status()
    results = found.json().get("movie_results", [])
    if not results:
        return None
    movie_id = results[0].get("id")
    if movie_id is None:
        # Malformed entry (missing "id"): treat as no-match rather than
        # raising KeyError and killing the whole run.
        return None
    detail = session.get(f"{BASE}/movie/{movie_id}", timeout=30)
    detail.raise_for_status()
    data = detail.json()
    countries = [c["iso_3166_1"] for c in data.get("production_countries", [])
                 if "iso_3166_1" in c]
    return {"imdb_id": imdb_id,
            "countries": countries,
            "original_language": data.get("original_language")}


def run():
    cache = config.WORK_DIR / "tmdb"
    cache.mkdir(parents=True, exist_ok=True)
    session = make_session()
    ids = [r[0] for r in duckdb.sql(
        f"SELECT imdb_id FROM '{config.WORK_DIR / 'corpus_index.parquet'}'").fetchall()]
    done = failed = 0
    for imdb_id in ids:
        dest = cache / f"{imdb_id}.json"
        if dest.exists():
            continue
        time.sleep(0.05)  # ~20 req/s, well under TMDB limits; throttle every attempt
        try:
            record = lookup(imdb_id, session)
        except (requests.RequestException, KeyError, TypeError, ValueError,
                AttributeError) as exc:
            # Never let one poison record kill an unattended ~1h run. AttributeError
            # covers non-dict TMDB payloads (e.g. a bare list/None), which otherwise
            # crash on `.get(...)` and kill the whole run.
            print(f"tmdb {imdb_id}: {exc}")
            failed += 1
            continue
        tmp = cache / f"{imdb_id}.json.tmp"
        tmp.write_text(json.dumps(record))  # 'null' for no-match: cached too
        os.replace(tmp, dest)  # atomic within the same dir; no partial-write cache entries
        done += 1
    print(f"enrich stage: fetched={done} failed={failed} total={len(ids)}")
