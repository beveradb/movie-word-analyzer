import json
import os
import zipfile

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from . import config
from .subtitle_parser import extract_text
from .wordcount import count_words

COUNTS_SCHEMA = pa.schema([("imdb_id", pa.string()), ("word", pa.string()),
                           ("count", pa.int32())])
STATS_SCHEMA = pa.schema([("imdb_id", pa.string()), ("total_words", pa.int64()),
                          ("unique_words", pa.int32()),
                          ("words_per_minute", pa.float64())])

_CACHE_RECORD_FIELDS = ("imdb_id", "zip_name", "counts", "total_words",
                        "unique_words", "words_per_minute")


def _cached(cache_dir, imdb_id, zip_name):
    dest = cache_dir / f"{imdb_id}.json"
    if not dest.exists():
        return None
    try:
        record = json.loads(dest.read_text())
    except json.JSONDecodeError:
        return None
    if not isinstance(record, dict):
        return None
    if any(field not in record for field in _CACHE_RECORD_FIELDS):
        return None
    return record if record.get("zip_name") == zip_name else None


def _write_cache(cache_dir, imdb_id, record):
    dest = cache_dir / f"{imdb_id}.json"
    tmp = cache_dir / f"{imdb_id}.json.tmp"
    tmp.write_text(json.dumps(record))
    os.replace(tmp, dest)


def build(zip_path, index_rows, cache_dir, out_counts, out_stats, runtimes):
    cache_dir.mkdir(parents=True, exist_ok=True)
    processed = skipped = failed = 0
    records = []
    with zipfile.ZipFile(zip_path) as z:
        for imdb_id, zip_name in index_rows:
            record = _cached(cache_dir, imdb_id, zip_name)
            if record:
                skipped += 1
                records.append(record)
                continue
            counts = count_words(extract_text(z.read(zip_name)))
            if not counts:
                failed += 1
                continue
            total = sum(counts.values())
            runtime = runtimes.get(imdb_id)
            record = {"imdb_id": imdb_id, "zip_name": zip_name, "counts": counts,
                      "total_words": total, "unique_words": len(counts),
                      "words_per_minute": total / runtime if runtime else None}
            _write_cache(cache_dir, imdb_id, record)
            processed += 1
            records.append(record)
    _compact(records, out_counts, out_stats)
    return {"processed": processed, "skipped": skipped, "failed": failed}


def _compact(records, out_counts, out_stats):
    # One `write_table` call per movie == one row group per movie in the output
    # parquet file. derive.py's per-movie hot-path queries (`SELECT word, count
    # FROM wc WHERE imdb_id = ?`) rely on this layout for row-group pruning: DuckDB
    # can skip whole row groups whose min/max imdb_id doesn't match the filter
    # instead of scanning the entire file. If this ever gets rewritten to batch
    # multiple movies into a single write_table call, that pruning benefit is lost
    # and derive's per-movie queries get much slower on the full corpus.
    with pq.ParquetWriter(out_counts, COUNTS_SCHEMA) as writer:
        for r in records:
            words, nums = zip(*sorted(r["counts"].items())) if r["counts"] else ((), ())
            writer.write_table(pa.table(
                {"imdb_id": [r["imdb_id"]] * len(words), "word": list(words),
                 "count": list(nums)}, schema=COUNTS_SCHEMA))
    pq.write_table(pa.table(
        {"imdb_id": [r["imdb_id"] for r in records],
         "total_words": [r["total_words"] for r in records],
         "unique_words": [r["unique_words"] for r in records],
         "words_per_minute": [r["words_per_minute"] for r in records]},
        schema=STATS_SCHEMA), out_stats)


def run():
    index_rows = duckdb.sql(
        f"SELECT imdb_id, zip_name FROM '{config.WORK_DIR / 'corpus_index.parquet'}'"
    ).fetchall()
    runtimes = dict(duckdb.sql(
        f"SELECT imdb_id, runtime_minutes FROM '{config.WORK_DIR / 'curated.parquet'}'"
    ).fetchall())
    report = build(config.RAW_DIR / "opus_en.zip", index_rows,
                   config.WORK_DIR / "counts" / config.LANG,
                   config.WORK_DIR / "word_counts.parquet",
                   config.WORK_DIR / "movie_stats.parquet", runtimes)
    print(f"count stage: {report}")
