import re
import zipfile
from collections import defaultdict
from pathlib import Path

import duckdb
import pyarrow as pa

from . import config

PATH_RE = re.compile(r"OpenSubtitles/raw/en/\d{4}/(\d+)/\d+\.xml$")

BLOCKLIST_PATH = Path(__file__).with_name("mislabeled_subs.txt")


def load_blocklist():
    """(blocked imdb_ids, blocked (imdb_id, zip_name) pairs) from the
    mislabeled-subtitles data file. Lines: imdb_id [zip_name] [comment]."""
    ids, pairs = set(), set()
    if not BLOCKLIST_PATH.exists():
        return ids, pairs
    for line in BLOCKLIST_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) == 1:
            ids.add(parts[0])
        else:
            pairs.add((parts[0], parts[1]))
    return ids, pairs


def imdb_id_from_path(name):
    m = PATH_RE.search(name)
    if not m:
        return None
    return "tt" + m.group(1).zfill(7)


def select_best(candidates, runtime_minutes):
    if not candidates:
        return None
    if runtime_minutes:
        lo = runtime_minutes * config.MIN_TOKENS_PER_MIN
        hi = runtime_minutes * config.MAX_TOKENS_PER_MIN
    else:
        lo, hi = config.FALLBACK_TOKEN_RANGE
    in_band = [(est, name) for name, est in candidates if lo <= est <= hi]
    return max(in_band)[1] if in_band else None


def run():
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    curated = duckdb.sql(
        f"SELECT imdb_id, runtime_minutes FROM '{config.WORK_DIR / 'curated.parquet'}'"
    ).fetchall()
    runtimes = dict(curated)
    blocked_ids, blocked_files = load_blocklist()
    by_movie = defaultdict(list)
    with zipfile.ZipFile(config.RAW_DIR / "opus_en.zip") as z:
        for info in z.infolist():
            imdb_id = imdb_id_from_path(info.filename)
            if imdb_id in blocked_ids:
                continue
            if imdb_id in runtimes:
                if (imdb_id, info.filename) in blocked_files:
                    continue
                by_movie[imdb_id].append((info.filename, info.file_size // 8))
    rows = []
    for imdb_id, cands in by_movie.items():
        best = select_best(cands, runtimes[imdb_id])
        if best:
            rows.append((imdb_id, best))
    table = pa.table({
        "imdb_id": pa.array([r[0] for r in rows], type=pa.string()),
        "zip_name": pa.array([r[1] for r in rows], type=pa.string()),
    })
    import pyarrow.parquet as pq
    pq.write_table(table, str(config.WORK_DIR / "corpus_index.parquet"))
