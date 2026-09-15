"""Fetch thorough per-film metadata from TMDB (one call per film via
append_to_response=credits,keywords) and write three tiers:

  tier 1  data/work/tmdb_meta/<imdb_id>.json   raw response (future-proof, resumable)
  tier 2  data/out/tmdb_meta.parquet           flat analysis record (build step)
  tier 3  webdata/out/all/json/blurb/<id>.json {overview, tagline, runtime} for the app

No VM, no recompute: driven by the published movies-index.json id list. Requires
TMDB_API_TOKEN (v4) or TMDB_API_KEY (v3) in the env.

Run: cd pipeline && uv run python scripts/fetch_tmdb_meta.py [--stage fetch|parquet|all]
                       [--workers 8] [--data-base https://data.moviewords.org]
"""
import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402
import requests  # noqa: E402

from moviewords_pipeline import config  # noqa: E402
from moviewords_pipeline.tmdb import BASE, make_session  # noqa: E402
from moviewords_pipeline.tmdb_meta import blurb_of, parse_record  # noqa: E402

CACHE = config.WORK_DIR / "tmdb_meta"
BLURB_OUT = Path(__file__).resolve().parents[1] / "webdata" / "out" / "all" / "json" / "blurb"


def detail(session, imdb_id):
    """Raw TMDB detail (+credits,+keywords), or None for no-match."""
    found = session.get(f"{BASE}/find/{imdb_id}",
                        params={"external_source": "imdb_id"}, timeout=30)
    found.raise_for_status()
    results = found.json().get("movie_results", [])
    if not results or results[0].get("id") is None:
        return None
    resp = session.get(f"{BASE}/movie/{results[0]['id']}",
                       params={"append_to_response": "credits,keywords"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, dict) else None


def _write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj))
    os.replace(tmp, path)  # atomic within the dir


def fetch_one(session, imdb_id):
    raw_path = CACHE / f"{imdb_id}.json"
    try:
        if raw_path.exists():
            raw = json.loads(raw_path.read_text())
        else:
            raw = detail(session, imdb_id)
            _write_json(raw_path, raw)  # 'null' cached too
        if raw is None:
            return "no-match"
        blurb = blurb_of(parse_record(raw, imdb_id))
        if blurb:
            _write_json(BLURB_OUT / f"{imdb_id}.json", blurb)
        return "ok"
    except Exception as exc:  # never let one film kill the batch
        print(f"tmdb-meta {imdb_id}: {exc}", flush=True)
        return "failed"


def load_ids(data_base):
    url = f"{data_base}/all/json/movies-index.json"
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return [m["id"] for m in resp.json()]


def build_parquet(cache_dir: Path, out_path: Path) -> int:
    """Consolidate the raw cache into a flat parquet. Returns rows written."""
    records = []
    for p in sorted(cache_dir.glob("*.json")):
        raw = json.loads(p.read_text())
        if raw is None:
            continue
        records.append(parse_record(raw, p.stem))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    jsonl = out_path.with_suffix(".jsonl")
    if records:
        jsonl.write_text("\n".join(json.dumps(r) for r in records))
        # sample_size=-1 scans every row for schema inference (the default
        # samples ~20k rows, which misses fields that are empty/null across the
        # whole sample but populated later — e.g. cast/keywords on a film deep in
        # the corpus — and then errors out); maximum_depth=-1 keeps nested
        # structs/lists fully typed rather than collapsing to JSON strings.
        duckdb.sql(
            f"COPY (SELECT * FROM read_json_auto('{jsonl}', format='newline_delimited', "
            f"sample_size=-1, maximum_depth=-1)) TO '{out_path}' (FORMAT parquet)")
        jsonl.unlink(missing_ok=True)
    return len(records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["fetch", "parquet", "all"], default="all")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--data-base", default=os.environ.get(
        "DATA_BASE", "https://data.moviewords.org"))
    args = parser.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    if args.stage in ("fetch", "all"):
        session = make_session()
        ids = load_ids(args.data_base)
        tally = {}
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for i, outcome in enumerate(pool.map(lambda m: fetch_one(session, m), ids)):
                tally[outcome] = tally.get(outcome, 0) + 1
                if (i + 1) % 1000 == 0:
                    print(f"{i + 1}/{len(ids)} {tally}", flush=True)
        print(f"fetch done: {tally}")
    if args.stage in ("parquet", "all"):
        rows = build_parquet(CACHE, config.OUT_DIR / "tmdb_meta.parquet")
        print(f"parquet: {rows} rows -> {config.OUT_DIR / 'tmdb_meta.parquet'}")


if __name__ == "__main__":
    main()
