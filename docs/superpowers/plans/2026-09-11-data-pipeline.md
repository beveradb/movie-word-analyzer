# Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python batch pipeline that turns the OPUS OpenSubtitles corpus + IMDb/TMDB metadata into the published movie word-count dataset (Parquet + JSON) and uploads it to R2.

**Architecture:** Staged CLI (`download → curate → index → count → enrich → derive`), each stage idempotent with cached intermediates in `data/work/`. The two expensive stages (count, enrich) keep **per-movie cache files keyed by language + IMDb ID + source subtitle**, so future scope expansions (lower vote threshold, TV, more languages) only process new items — already-processed movies are skipped. Heavy lifting (joins, aggregation, Parquet) in DuckDB; subtitle parsing/tokenizing in plain Python streamed from the OPUS zip without full extraction.

**Tech Stack:** Python 3.12, uv, pytest, duckdb, pyarrow, requests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-11-movie-word-analyzer-design.md` — dataset contract table is authoritative.
- Corpus cut: IMDb `titleType = movie` AND `numVotes >= 1000` AND TMDB `original_language == "en"`.
- No subtitle text in outputs — only per-movie word counts (bags of words).
- `data/raw/` and `data/work/` are gitignored; never commit data or secrets. TMDB token from env `TMDB_API_TOKEN`.
- Per-file pipeline failures are logged and skipped, never fatal.
- **Incremental by design:** expensive per-movie work (count, enrich) is cached one file per movie under `data/work/`, keyed by language + IMDb ID (+ source subtitle for counts). Re-runs with a broader corpus cut must skip cached movies. Cheap stages (curate, index, derive compaction) may rebuild fully.
- All code under `pipeline/`; run tests with `cd pipeline && uv run pytest`.

## File Structure

```
pipeline/
  pyproject.toml
  src/moviewords_pipeline/
    __init__.py
    config.py            # paths, URLs, thresholds
    cli.py               # argparse entry, one subcommand per stage
    download.py          # cached downloads of OPUS zip + IMDb TSVs
    subtitle_parser.py   # OPUS XML -> cleaned dialogue text
    wordcount.py         # tokenize + count
    curate.py            # IMDb filter -> curated movie table
    corpus_index.py      # scan zip, pick one subtitle file per movie
    counts.py            # per-movie bags of words -> word_counts.parquet
    tmdb.py              # country/language enrichment, disk-cached
    derive.py            # final artifacts: parquet + JSON
    stopwords_en.txt     # ~180-word standard English stopword list
    profanity_en.txt     # small curated profanity list
  scripts/upload_r2.sh
  tests/
    fixtures/            # tiny XML subs, mini IMDb TSVs, TMDB JSON
    test_subtitle_parser.py
    test_wordcount.py
    test_curate.py
    test_corpus_index.py
    test_counts.py
    test_tmdb.py
    test_derive.py
    test_e2e.py
```

Stage data flow (paths from `config.py`):

```
data/raw/opus_en.zip, title.basics.tsv.gz, title.ratings.tsv.gz   (download)
data/work/curated.parquet                                          (curate)
data/work/corpus_index.parquet                                     (index)
data/work/counts/en/tt*.json          per-movie cache, resumable   (count)
data/work/word_counts.parquet, movie_stats.parquet   compacted     (count)
data/work/tmdb/tt*.json               per-movie cache, resumable   (enrich)
data/out/{movies.parquet, word_year.parquet,
          words_by_movie/data.parquet, words_by_word/data.parquet,
          json/movie/tt*.json, json/leaderboard-default.json,
          report.md}                                               (derive)
```

---

### Task 1: Pipeline scaffolding

**Files:**
- Create: `pipeline/pyproject.toml`, `pipeline/src/moviewords_pipeline/__init__.py`, `pipeline/src/moviewords_pipeline/config.py`, `pipeline/src/moviewords_pipeline/cli.py`, `pipeline/tests/test_cli.py`

**Interfaces:**
- Produces: `config.RAW_DIR/WORK_DIR/OUT_DIR` (pathlib.Path, rooted at repo `data/`), `config.OPUS_URL`, `config.IMDB_BASICS_URL`, `config.IMDB_RATINGS_URL`, `config.MIN_VOTES = 1000`; `cli.main(argv)` dispatching subcommands `download curate index count enrich derive`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_cli.py`:
```python
from moviewords_pipeline import config
from moviewords_pipeline.cli import main


def test_config_paths_rooted_at_repo_data():
    assert config.RAW_DIR.name == "raw"
    assert config.WORK_DIR.name == "work"
    assert config.OUT_DIR.name == "out"
    assert config.RAW_DIR.parent == config.WORK_DIR.parent


def test_cli_lists_stages(capsys):
    try:
        main(["--help"])
    except SystemExit:
        pass
    out = capsys.readouterr().out
    for stage in ["download", "curate", "index", "count", "enrich", "derive"]:
        assert stage in out
```

- [ ] **Step 2: Create the uv project and run the test to verify it fails**

```bash
cd pipeline && uv init --lib --name moviewords-pipeline --python 3.12
uv add duckdb pyarrow requests && uv add --dev pytest
uv run pytest tests/test_cli.py -v
```
Expected: FAIL with `ModuleNotFoundError` / `ImportError` for `config`/`cli`.

- [ ] **Step 3: Write minimal implementation**

`pipeline/src/moviewords_pipeline/config.py`:
```python
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
```

`pipeline/src/moviewords_pipeline/cli.py`:
```python
import argparse

STAGES = ["download", "curate", "index", "count", "enrich", "derive"]


def main(argv=None):
    parser = argparse.ArgumentParser(prog="moviewords-pipeline")
    sub = parser.add_subparsers(dest="stage", required=True)
    for stage in STAGES:
        sub.add_parser(stage)
    args = parser.parse_args(argv)
    # stage runners are registered as tasks land; import lazily
    from importlib import import_module
    mod = import_module(f"moviewords_pipeline.{_module_for(args.stage)}")
    mod.run()


def _module_for(stage):
    return {"download": "download", "curate": "curate", "index": "corpus_index",
            "count": "counts", "enrich": "tmdb", "derive": "derive"}[stage]


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cli.py -v` — Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): scaffold uv project, config, and stage CLI"
```

---

### Task 2: Cached downloads + corpus URL verification

**Files:**
- Create: `pipeline/src/moviewords_pipeline/download.py`, `pipeline/tests/test_download.py`

**Interfaces:**
- Consumes: `config` URLs and `RAW_DIR`.
- Produces: `download.fetch(url: str, dest: Path) -> Path` (skips when `dest` exists and is non-empty; streams to `dest.with_suffix(".part")` then renames); `download.run()` fetching the three sources into `RAW_DIR` as `opus_en.zip`, `title.basics.tsv.gz`, `title.ratings.tsv.gz`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_download.py`:
```python
from moviewords_pipeline.download import fetch


def test_fetch_skips_existing_file(tmp_path, monkeypatch):
    dest = tmp_path / "f.bin"
    dest.write_bytes(b"cached")

    def boom(*a, **k):
        raise AssertionError("network touched despite cache")

    monkeypatch.setattr("requests.get", boom)
    assert fetch("https://example.com/f.bin", dest) == dest
    assert dest.read_bytes() == b"cached"


def test_fetch_streams_then_renames(tmp_path, monkeypatch):
    class FakeResp:
        def raise_for_status(self): pass
        def iter_content(self, chunk_size): return iter([b"ab", b"cd"])
        def __enter__(self): return self
        def __exit__(self, *a): pass

    monkeypatch.setattr("requests.get", lambda *a, **k: FakeResp())
    dest = tmp_path / "f.bin"
    fetch("https://example.com/f.bin", dest)
    assert dest.read_bytes() == b"abcd"
    assert not dest.with_suffix(".part").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_download.py -v` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

`pipeline/src/moviewords_pipeline/download.py`:
```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_download.py -v` — Expected: 2 PASS.

- [ ] **Step 5: Verify the real OPUS v2024 URL exists (assumption check — no download)**

Run: `curl -sIL -o /dev/null -w "%{http_code} %{url_effective}\n" https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2024/raw/en.zip`
Expected: `200`. If 404/403: check https://opus.nlpl.eu/OpenSubtitles for the current release name and update `config.OPUS_URL` (v2018 fallback: same path with `v2018`). Record the final URL choice in the commit message.

- [ ] **Step 6: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): cached streaming downloads for OPUS and IMDb sources"
```

---

### Task 3: Subtitle XML parsing & cleaning

**Files:**
- Create: `pipeline/src/moviewords_pipeline/subtitle_parser.py`, `pipeline/tests/test_subtitle_parser.py`, `pipeline/tests/fixtures/sub_basic.xml`, `pipeline/tests/fixtures/sub_noisy.xml`

**Interfaces:**
- Produces: `subtitle_parser.extract_text(xml_bytes: bytes) -> str` — cleaned dialogue joined by newlines; raises nothing (malformed XML → returns `""`).

OPUS raw files are XML: `<document>` containing `<s id="1">` sentence elements whose text (possibly nested in `<w>` tokens or plain) is the subtitle line, plus `<time>` elements to ignore.

- [ ] **Step 1: Create fixtures**

`pipeline/tests/fixtures/sub_basic.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<document id="4174253">
  <s id="1"><time id="T1S" value="00:00:01,000" />You know what they call a
Quarter Pounder with Cheese in Paris?<time id="T1E" value="00:00:04,000" /></s>
  <s id="2">They call it a Royale with Cheese.</s>
</document>
```

`pipeline/tests/fixtures/sub_noisy.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<document id="99">
  <s id="1">&lt;i&gt;Previously on the show...&lt;/i&gt;</s>
  <s id="2">Subtitles by SomeGroup - www.example.com</s>
  <s id="3">Sync and corrections by srjanapala</s>
  <s id="4">[door slams]</s>
  <s id="5">♪ la la la ♪</s>
  <s id="6">- Hello there.
- General Kenobi!</s>
</document>
```

- [ ] **Step 2: Write the failing test**

`pipeline/tests/test_subtitle_parser.py`:
```python
from pathlib import Path

from moviewords_pipeline.subtitle_parser import extract_text

FIX = Path(__file__).parent / "fixtures"


def test_extracts_dialogue_lines():
    text = extract_text((FIX / "sub_basic.xml").read_bytes())
    assert "Quarter Pounder" in text
    assert "Royale with Cheese" in text
    assert "00:00" not in text  # no timestamps


def test_strips_noise():
    text = extract_text((FIX / "sub_noisy.xml").read_bytes())
    assert "<i>" not in text and "Previously on the show" in text
    assert "Subtitles by" not in text          # credit lines dropped
    assert "corrections by" not in text
    assert "door slams" not in text            # SDH cues dropped
    assert "la la la" not in text              # song lines dropped
    assert "Hello there" in text and "General Kenobi" in text


def test_malformed_xml_returns_empty():
    assert extract_text(b"<document><s>broken") == ""
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_subtitle_parser.py -v` — Expected: FAIL, module missing.

- [ ] **Step 4: Write minimal implementation**

`pipeline/src/moviewords_pipeline/subtitle_parser.py`:
```python
import re
from xml.etree import ElementTree

TAG_RE = re.compile(r"<[^>]+>")
BRACKET_RE = re.compile(r"[\[(][^\])]*[\])]")   # [door slams], (sighs)
CREDIT_RE = re.compile(
    r"subtitles?\s+by|subs\s+by|sync(ed)?\b.*\bby|corrections?\s+by|"
    r"encoded\s+by|opensubtitles|addic7ed|www\.|https?://",
    re.IGNORECASE,
)
MUSIC_RE = re.compile(r"[♪♫#]")


def extract_text(xml_bytes):
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return ""
    lines = []
    for s in root.iter("s"):
        raw = " ".join("".join(s.itertext()).split())
        raw = TAG_RE.sub(" ", raw)          # literal <i> etc. embedded as text
        if CREDIT_RE.search(raw) or MUSIC_RE.search(raw):
            continue
        raw = BRACKET_RE.sub(" ", raw)
        raw = raw.lstrip("- ").strip()
        if raw:
            lines.append(raw)
    return "\n".join(lines)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_subtitle_parser.py -v` — Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): OPUS subtitle XML parser with noise/credit stripping"
```

---

### Task 4: Tokenizer & word counting

**Files:**
- Create: `pipeline/src/moviewords_pipeline/wordcount.py`, `pipeline/tests/test_wordcount.py`

**Interfaces:**
- Produces: `wordcount.tokenize(text: str) -> list[str]` (lowercased, `a-z` + internal apostrophes, contractions kept whole); `wordcount.count_words(text: str) -> collections.Counter`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_wordcount.py`:
```python
from moviewords_pipeline.wordcount import count_words, tokenize


def test_tokenize_lowercases_and_keeps_contractions():
    assert tokenize("Don't stop ME now!") == ["don't", "stop", "me", "now"]


def test_tokenize_strips_wrapping_quotes_and_numbers():
    assert tokenize("'tis 42 the 'best' day") == ["'tis", "the", "best", "day"]


def test_count_words():
    counts = count_words("the cat and the hat")
    assert counts["the"] == 2 and counts["cat"] == 1
```

Note: `'tis` keeps its leading apostrophe only when not used as a quote pair;
simplest consistent rule — strip apostrophes only when the token is fully
wrapped (`'best'`), otherwise keep leading/trailing intact.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_wordcount.py -v` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

`pipeline/src/moviewords_pipeline/wordcount.py`:
```python
import re
from collections import Counter

TOKEN_RE = re.compile(r"[a-z']+")


def tokenize(text):
    tokens = []
    for tok in TOKEN_RE.findall(text.lower()):
        if tok.startswith("'") and tok.endswith("'") and len(tok) > 1:
            tok = tok.strip("'")
        if tok.strip("'"):  # drop bare apostrophes
            tokens.append(tok)
    return tokens


def count_words(text):
    return Counter(tokenize(text))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_wordcount.py -v` — Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): tokenizer and per-text word counting"
```

---

### Task 5: IMDb curation stage

**Files:**
- Create: `pipeline/src/moviewords_pipeline/curate.py`, `pipeline/tests/test_curate.py`, `pipeline/tests/fixtures/mini.basics.tsv.gz`, `pipeline/tests/fixtures/mini.ratings.tsv.gz`

**Interfaces:**
- Consumes: `config.RAW_DIR` TSVs, `config.MIN_VOTES`.
- Produces: `curate.build_curated(basics_path, ratings_path, min_votes) -> duckdb relation` and `curate.run()` writing `WORK_DIR/curated.parquet` with columns `imdb_id (tt-string), title, year (int), runtime_minutes (int, nullable), genres (list<str>), rating (double), votes (int)`.

- [ ] **Step 1: Create fixtures**

```bash
cd pipeline/tests/fixtures
printf 'tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres\ntt0110912\tmovie\tPulp Fiction\tPulp Fiction\t0\t1994\t\\N\t154\tCrime,Drama\ntt0000001\tshort\tCarmencita\tCarmencita\t0\t1894\t\\N\t1\tDocumentary\ntt0903747\ttvSeries\tBreaking Bad\tBreaking Bad\t0\t2008\t2013\t45\tCrime,Drama\ntt9999999\tmovie\tObscure Film\tObscure Film\t0\t2001\t\\N\t90\tDrama\n' > mini.basics.tsv
printf 'tconst\taverageRating\tnumVotes\ntt0110912\t8.9\t2000000\ntt0000001\t5.7\t2000\ntt0903747\t9.5\t1900000\ntt9999999\t6.1\t12\n' > mini.ratings.tsv
gzip -f mini.basics.tsv mini.ratings.tsv
```

- [ ] **Step 2: Write the failing test**

`pipeline/tests/test_curate.py`:
```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_curate.py -v` — Expected: FAIL, module missing.

- [ ] **Step 4: Write minimal implementation**

`pipeline/src/moviewords_pipeline/curate.py`:
```python
import duckdb

from . import config


def build_curated(basics_path, ratings_path, min_votes):
    con = duckdb.connect()
    return con.sql(f"""
        SELECT b.tconst AS imdb_id,
               b.primaryTitle AS title,
               CAST(b.startYear AS INT) AS year,
               TRY_CAST(b.runtimeMinutes AS INT) AS runtime_minutes,
               string_split(b.genres, ',') AS genres,
               CAST(r.averageRating AS DOUBLE) AS rating,
               CAST(r.numVotes AS INT) AS votes
        FROM read_csv('{basics_path}', delim='\t', header=true,
                      quote='', nullstr='\\N', all_varchar=true) b
        JOIN read_csv('{ratings_path}', delim='\t', header=true,
                      quote='', nullstr='\\N', all_varchar=true) r
          ON b.tconst = r.tconst
        WHERE b.titleType = 'movie'
          AND CAST(r.numVotes AS INT) >= {int(min_votes)}
          AND b.startYear IS NOT NULL
    """)


def run():
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    rel = build_curated(config.RAW_DIR / "title.basics.tsv.gz",
                        config.RAW_DIR / "title.ratings.tsv.gz",
                        config.MIN_VOTES)
    rel.write_parquet(str(config.WORK_DIR / "curated.parquet"))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_curate.py -v` — Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): IMDb curation stage (movies with >=1000 votes)"
```

---

### Task 6: Corpus indexing & subtitle selection

**Files:**
- Create: `pipeline/src/moviewords_pipeline/corpus_index.py`, `pipeline/tests/test_corpus_index.py`, `pipeline/tests/fixtures/make_mini_corpus.py`

**Interfaces:**
- Consumes: `WORK_DIR/curated.parquet`; OPUS zip layout `OpenSubtitles/raw/en/<year>/<numeric_imdb_id>/<sub_id>.xml`.
- Produces: `corpus_index.imdb_id_from_path(name: str) -> str | None` (numeric dir → zero-padded `tt` id, min 7 digits); `corpus_index.select_best(candidates: list[tuple[str, int]], runtime_minutes: int | None) -> str | None` (candidates are `(zip_name, token_estimate)`; token_estimate = uncompressed size // 8 as a cheap proxy; picks largest within the plausible band from `config`, else None); `corpus_index.run()` writing `WORK_DIR/corpus_index.parquet` (`imdb_id, zip_name`).

- [ ] **Step 1: Write the fixture-corpus builder (shared with e2e test)**

`pipeline/tests/fixtures/make_mini_corpus.py`:
```python
"""Build a tiny OPUS-layout zip from the XML fixtures for tests."""
import zipfile
from pathlib import Path

FIX = Path(__file__).parent


def build(zip_path):
    basic = (FIX / "sub_basic.xml").read_bytes()
    noisy = (FIX / "sub_noisy.xml").read_bytes()
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr("OpenSubtitles/raw/en/1994/110912/1.xml", basic * 200)
        z.writestr("OpenSubtitles/raw/en/1994/110912/2.xml", basic)  # too small
        z.writestr("OpenSubtitles/raw/en/2001/9999999/3.xml", noisy * 200)
        z.writestr("OpenSubtitles/raw/en/1894/1/4.xml", basic)       # not curated
    return zip_path
```

- [ ] **Step 2: Write the failing test**

`pipeline/tests/test_corpus_index.py`:
```python
from moviewords_pipeline.corpus_index import imdb_id_from_path, select_best


def test_imdb_id_from_path():
    assert imdb_id_from_path("OpenSubtitles/raw/en/1994/110912/1.xml") == "tt0110912"
    assert imdb_id_from_path("OpenSubtitles/raw/en/2020/13320622/9.xml") == "tt13320622"
    assert imdb_id_from_path("OpenSubtitles/raw/en/1994/110912/") is None


def test_select_best_prefers_largest_in_band():
    # runtime 100 min -> plausible 2,000..25,000 tokens
    cands = [("a.xml", 500), ("b.xml", 9_000), ("c.xml", 14_000), ("d.xml", 400_000)]
    assert select_best(cands, 100) == "c.xml"


def test_select_best_none_when_all_outside_band():
    assert select_best([("a.xml", 10)], 100) is None


def test_select_best_uses_fallback_range_without_runtime():
    assert select_best([("a.xml", 5_000), ("b.xml", 100_000)], None) == "a.xml"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_corpus_index.py -v` — Expected: FAIL, module missing.

- [ ] **Step 4: Write minimal implementation**

`pipeline/src/moviewords_pipeline/corpus_index.py`:
```python
import re
import zipfile
from collections import defaultdict

import duckdb

from . import config

PATH_RE = re.compile(r"OpenSubtitles/raw/en/\d{4}/(\d+)/\d+\.xml$")


def imdb_id_from_path(name):
    m = PATH_RE.search(name)
    if not m:
        return None
    return "tt" + m.group(1).zfill(7)


def select_best(candidates, runtime_minutes):
    if runtime_minutes:
        lo = runtime_minutes * config.MIN_TOKENS_PER_MIN
        hi = runtime_minutes * config.MAX_TOKENS_PER_MIN
    else:
        lo, hi = config.FALLBACK_TOKEN_RANGE
    in_band = [(est, name) for name, est in candidates if lo <= est <= hi]
    return max(in_band)[1] if in_band else None


def run():
    curated = duckdb.sql(
        f"SELECT imdb_id, runtime_minutes FROM '{config.WORK_DIR / 'curated.parquet'}'"
    ).fetchall()
    runtimes = dict(curated)
    by_movie = defaultdict(list)
    with zipfile.ZipFile(config.RAW_DIR / "opus_en.zip") as z:
        for info in z.infolist():
            imdb_id = imdb_id_from_path(info.filename)
            if imdb_id in runtimes:
                by_movie[imdb_id].append((info.filename, info.file_size // 8))
    rows = []
    for imdb_id, cands in by_movie.items():
        best = select_best(cands, runtimes[imdb_id])
        if best:
            rows.append((imdb_id, best))
    duckdb.sql(
        "SELECT * FROM (VALUES " + ",".join(["(?, ?)"] * len(rows)) + ") t(imdb_id, zip_name)",
        params=[v for row in rows for v in row],
    ).write_parquet(str(config.WORK_DIR / "corpus_index.parquet"))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_corpus_index.py -v` — Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): corpus indexing with plausibility-band subtitle selection"
```

---

### Task 7: Count building stage

**Files:**
- Create: `pipeline/src/moviewords_pipeline/counts.py`, `pipeline/tests/test_counts.py`

**Interfaces:**
- Consumes: `corpus_index.parquet`, `curated.parquet`, the OPUS zip, `subtitle_parser.extract_text`, `wordcount.count_words`; `config.LANG = "en"` (add to `config.py`).
- Produces: `counts.build(zip_path, index_rows: list[tuple[str, str]], cache_dir: Path, out_counts: Path, out_stats: Path, runtimes: dict) -> dict` (returns `{"processed": int, "skipped": int, "failed": int}`); `counts.run()` using `cache_dir = WORK_DIR / "counts" / config.LANG`.
- **Resumability contract:** one cache file per movie, `cache_dir/<imdb_id>.json` = `{"imdb_id", "zip_name", "counts": {word: n}, "total_words", "unique_words", "words_per_minute"}`. A movie is skipped (no parse) when its cache file exists **and** its `zip_name` matches the current index — so expanding the corpus cut only parses new movies, while an improved subtitle selection invalidates just the affected movies. Compaction of the cache into `WORK_DIR/word_counts.parquet` (`imdb_id, word, count`) and `WORK_DIR/movie_stats.parquet` (`imdb_id, total_words, unique_words, words_per_minute`) runs every time (cheap, no XML parsing). Failures (empty parse) are skipped and counted, never raised, and are not cached (retried next run).

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_counts.py`:
```python
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
```

Also add to `pipeline/pyproject.toml` so `tests.fixtures` imports work:
```toml
[tool.pytest.ini_options]
rootdir = "."
addopts = "--import-mode=importlib"
```
(and ensure `uv add --dev pandas` for `.df()` in tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_counts.py -v` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

Add to `pipeline/src/moviewords_pipeline/config.py`:
```python
LANG = "en"
```

`pipeline/src/moviewords_pipeline/counts.py`:
```python
import json
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


def _cached(cache_dir, imdb_id, zip_name):
    dest = cache_dir / f"{imdb_id}.json"
    if not dest.exists():
        return None
    record = json.loads(dest.read_text())
    return record if record.get("zip_name") == zip_name else None


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
            (cache_dir / f"{imdb_id}.json").write_text(json.dumps(record))
            processed += 1
            records.append(record)
    _compact(records, out_counts, out_stats)
    return {"processed": processed, "skipped": skipped, "failed": failed}


def _compact(records, out_counts, out_stats):
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
```

Memory note: `records` holds all cached bags in RAM during compaction — at
~40k movies × ~5k words this is a few GB, acceptable on the Mac. If it becomes
a problem at larger scope, stream `_compact` from cache files instead; do not
optimize now.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_counts.py -v` — Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): incremental per-movie count stage with resumable cache"
```

---

### Task 8: TMDB enrichment

**Files:**
- Create: `pipeline/src/moviewords_pipeline/tmdb.py`, `pipeline/tests/test_tmdb.py`

**Interfaces:**
- Consumes: `curated.parquet` ids; env `TMDB_API_TOKEN` (v4 read token).
- Produces: `tmdb.lookup(imdb_id: str, session) -> dict | None` returning `{"imdb_id", "countries": [iso2...], "original_language": str}` (None when TMDB has no match); `tmdb.run()` writing one JSON per film to `WORK_DIR/tmdb/<imdb_id>.json`, skipping existing files (resumable), HTTP errors logged + skipped.

API calls: `GET https://api.themoviedb.org/3/find/{imdb_id}?external_source=imdb_id` → `movie_results[0].id`, then `GET /3/movie/{id}` → `production_countries[].iso_3166_1`, `original_language`. Header `Authorization: Bearer $TMDB_API_TOKEN`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_tmdb.py`:
```python
from moviewords_pipeline.tmdb import lookup


class FakeSession:
    def __init__(self, responses):
        self.responses = responses

    def get(self, url, **kw):
        class R:
            def __init__(self, payload): self.payload = payload
            def raise_for_status(self): pass
            def json(self): return self.payload
        for frag, payload in self.responses.items():
            if frag in url:
                return R(payload)
        raise AssertionError(f"unexpected url {url}")


def test_lookup_happy_path():
    session = FakeSession({
        "/find/tt0110912": {"movie_results": [{"id": 680}]},
        "/movie/680": {"production_countries": [{"iso_3166_1": "US"}],
                        "original_language": "en"},
    })
    assert lookup("tt0110912", session) == {
        "imdb_id": "tt0110912", "countries": ["US"], "original_language": "en"}


def test_lookup_no_match_returns_none():
    session = FakeSession({"/find/tt0000000": {"movie_results": []}})
    assert lookup("tt0000000", session) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_tmdb.py -v` — Expected: FAIL, module missing.

- [ ] **Step 3: Write minimal implementation**

`pipeline/src/moviewords_pipeline/tmdb.py`:
```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_tmdb.py -v` — Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): resumable TMDB country/language enrichment"
```

---

### Task 9: Derive stage — published artifacts

**Files:**
- Create: `pipeline/src/moviewords_pipeline/derive.py`, `pipeline/src/moviewords_pipeline/stopwords_en.txt`, `pipeline/src/moviewords_pipeline/profanity_en.txt`, `pipeline/tests/test_derive.py`

**Interfaces:**
- Consumes: all `WORK_DIR` intermediates.
- Produces: `derive.log_odds(movie_counts: dict[str,int], corpus_counts: dict[str,int], alpha0: float = 100.0) -> list[tuple[str, float]]` (Monroe-style log-odds with Dirichlet prior from corpus frequencies, descending z); `derive.run()` writing everything under `OUT_DIR` per the dataset contract:
  - `movies.parquet`: curated ⨝ stats ⨝ tmdb, **filtered to `original_language = 'en'`**, columns `imdb_id, title, year, countries (list), genres (list), runtime_minutes, rating, votes, total_words, unique_words, words_per_minute`.
  - `words_by_movie/data.parquet` sorted by `(imdb_id, count DESC)`; `words_by_word/data.parquet` sorted by `(word, imdb_id)`; both filtered to movies present in `movies.parquet`.
  - `word_year.parquet`: `word, year, count, movie_count`, words with corpus total ≥ 20.
  - `json/movie/<imdb_id>.json`: `{imdb_id, title, year, stats:{total_words, unique_words, words_per_minute}, top:[[word,count]×200 excl. stopwords], top_all:[[word,count]×50 incl. stopwords], distinctive:[[word,z]×50]}`.
  - `json/leaderboard-default.json`: `{words:[[word,count,movie_count]×1000 excl. stopwords], stopwords:[...×50 incl.]}`.
  - `report.md`: counts per stage — curated, matched, counted, enriched, final; drop reasons.
- Stopword/profanity lists: `derive.load_stopwords() -> set[str]`, `derive.load_profanity() -> set[str]` reading the packaged txt files (one word per line, `#` comments). Fill `stopwords_en.txt` with the standard ~180-word English list (NLTK's, public domain) and `profanity_en.txt` with ~30 common English profanities — actual word lists, committed.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_derive.py`:
```python
from moviewords_pipeline.derive import load_stopwords, log_odds


def test_stopwords_load():
    sw = load_stopwords()
    assert {"the", "and", "of"} <= sw
    assert len(sw) > 100


def test_log_odds_ranks_overrepresented_words_first():
    movie = {"cheese": 50, "the": 100}
    corpus = {"cheese": 60, "the": 100_000, "of": 50_000}
    ranked = log_odds(movie, corpus)
    assert ranked[0][0] == "cheese"
    assert ranked[0][1] > 0


def test_log_odds_ignores_rare_noise():
    movie = {"zzxq": 1, "cheese": 40}
    corpus = {"cheese": 500, "the": 100_000}
    ranked = dict(log_odds(movie, corpus, min_count=3))
    assert "zzxq" not in ranked
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_derive.py -v` — Expected: FAIL, module missing.

- [ ] **Step 3: Write the word lists and implementation**

Create `stopwords_en.txt` (NLTK English stopword list, one per line) and
`profanity_en.txt` (e.g. fuck, fucking, shit, damn, hell, ass, bitch, bastard,
crap, piss, dick, cock, pussy, asshole, motherfucker, bullshit, goddamn, cunt,
prick, wanker, bollocks, arse, twat, shite — one per line).

`pipeline/src/moviewords_pipeline/derive.py`:
```python
import json
import math
from importlib import resources

import duckdb

from . import config


def _load_wordlist(name):
    text = resources.files("moviewords_pipeline").joinpath(name).read_text()
    return {w.strip() for w in text.splitlines()
            if w.strip() and not w.startswith("#")}


def load_stopwords():
    return _load_wordlist("stopwords_en.txt")


def load_profanity():
    return _load_wordlist("profanity_en.txt")


def log_odds(movie_counts, corpus_counts, alpha0=100.0, min_count=3):
    """Monroe et al. log-odds with informative Dirichlet prior from the corpus."""
    n_movie = sum(movie_counts.values())
    n_corpus = sum(corpus_counts.values())
    out = []
    for word, y in movie_counts.items():
        if y < min_count:
            continue
        prior = alpha0 * corpus_counts.get(word, 0) / n_corpus
        if prior == 0:
            continue
        y_c = corpus_counts[word]
        delta = (math.log((y + prior) / (n_movie + alpha0 - y - prior))
                 - math.log((y_c + prior) / (n_corpus + alpha0 - y_c - prior)))
        var = 1.0 / (y + prior) + 1.0 / (y_c + prior)
        out.append((word, delta / math.sqrt(var)))
    return sorted(out, key=lambda t: -t[1])


def run():
    out = config.OUT_DIR
    (out / "words_by_movie").mkdir(parents=True, exist_ok=True)
    (out / "words_by_word").mkdir(exist_ok=True)
    (out / "json" / "movie").mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    w = config.WORK_DIR
    con.sql(f"""
        CREATE VIEW curated AS SELECT * FROM '{w / "curated.parquet"}';
        CREATE VIEW stats AS SELECT * FROM '{w / "movie_stats.parquet"}';
        CREATE VIEW wc AS SELECT * FROM '{w / "word_counts.parquet"}';
        CREATE TABLE tmdb AS SELECT * FROM read_json('{w / "tmdb"}/*.json',
            columns={{'imdb_id':'VARCHAR','countries':'VARCHAR[]',
                      'original_language':'VARCHAR'}});
    """)
    con.sql(f"""
        CREATE TABLE movies AS
        SELECT c.imdb_id, c.title, c.year, t.countries, c.genres,
               c.runtime_minutes, c.rating, c.votes,
               s.total_words, s.unique_words, s.words_per_minute
        FROM curated c
        JOIN stats s USING (imdb_id)
        JOIN tmdb t USING (imdb_id)
        WHERE t.original_language = 'en';
    """)
    con.sql(f"COPY movies TO '{out / 'movies.parquet'}' (FORMAT parquet)")
    con.sql(f"""
        COPY (SELECT wc.* FROM wc JOIN movies USING (imdb_id)
              ORDER BY imdb_id, count DESC)
        TO '{out / 'words_by_movie' / 'data.parquet'}' (FORMAT parquet);
    """)
    con.sql(f"""
        COPY (SELECT wc.* FROM wc JOIN movies USING (imdb_id)
              ORDER BY word, imdb_id)
        TO '{out / 'words_by_word' / 'data.parquet'}' (FORMAT parquet);
    """)
    con.sql(f"""
        COPY (SELECT word, year, SUM(count)::BIGINT AS count,
                     COUNT(DISTINCT wc.imdb_id) AS movie_count
              FROM wc JOIN movies USING (imdb_id)
              GROUP BY word, year
              QUALIFY SUM(SUM(count)) OVER (PARTITION BY word) >= 20
              ORDER BY word, year)
        TO '{out / 'word_year.parquet'}' (FORMAT parquet);
    """)
    _write_json_hot_paths(con, out)
    _write_report(con, out)


def _write_json_hot_paths(con, out):
    stop = load_stopwords()
    corpus = dict(con.sql(
        "SELECT word, SUM(count) FROM wc JOIN movies USING (imdb_id) GROUP BY word"
    ).fetchall())
    movies = con.sql("SELECT * FROM movies").df().to_dict("records")
    for m in movies:
        rows = con.sql(
            "SELECT word, count FROM wc WHERE imdb_id = ? ORDER BY count DESC",
            params=[m["imdb_id"]]).fetchall()
        counts = dict(rows)
        payload = {
            "imdb_id": m["imdb_id"], "title": m["title"], "year": int(m["year"]),
            "stats": {"total_words": int(m["total_words"]),
                      "unique_words": int(m["unique_words"]),
                      "words_per_minute": m["words_per_minute"]},
            "top": [[w, c] for w, c in rows if w not in stop][:200],
            "top_all": [[w, c] for w, c in rows][:50],
            "distinctive": [[w, round(z, 2)]
                            for w, z in log_odds(counts, corpus)[:50]],
        }
        (out / "json" / "movie" / f"{m['imdb_id']}.json").write_text(
            json.dumps(payload))
    board = con.sql("""
        SELECT word, SUM(count)::BIGINT, COUNT(DISTINCT wc.imdb_id)
        FROM wc JOIN movies USING (imdb_id)
        GROUP BY word ORDER BY 2 DESC
    """).fetchall()
    (out / "json" / "leaderboard-default.json").write_text(json.dumps({
        "words": [[w, c, mc] for w, c, mc in board if w not in stop][:1000],
        "stopwords": [[w, c, mc] for w, c, mc in board if w in stop][:50],
    }))


def _write_report(con, out):
    n = lambda q: con.sql(q).fetchone()[0]
    report = (
        f"# Pipeline report\n\n"
        f"- curated movies: {n('SELECT COUNT(*) FROM curated')}\n"
        f"- with counts: {n('SELECT COUNT(*) FROM stats')}\n"
        f"- tmdb-enriched: {n('SELECT COUNT(*) FROM tmdb WHERE imdb_id IS NOT NULL')}\n"
        f"- final (english originals): {n('SELECT COUNT(*) FROM movies')}\n"
    )
    (out / "report.md").write_text(report)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_derive.py -v` — Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline && git commit -m "feat(pipeline): derive stage producing published parquet + JSON artifacts"
```

---

### Task 10: End-to-end fixture run

**Files:**
- Create: `pipeline/tests/test_e2e.py`

**Interfaces:**
- Consumes: every stage's `build`/pure functions + `derive.run` internals, wired against the fixture mini-corpus and fixture IMDb TSVs, with a fixture TMDB cache (no network).

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_e2e.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails, then fix wiring until it passes**

Run: `uv run pytest tests/test_e2e.py -v`
Expected: initially FAIL (path/wiring mismatches between stages are exactly what
this test exists to catch). Fix stage code — not the test's contract — until PASS.
Then run the whole suite: `uv run pytest -v` — Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add pipeline && git commit -m "test(pipeline): end-to-end fixture-corpus pipeline test"
```

---

### Task 11: R2 upload script + full-run runbook

**Files:**
- Create: `pipeline/scripts/upload_r2.sh`, `pipeline/README.md`
- Modify: `README.md` (repo root — link to pipeline README)

**Interfaces:**
- Consumes: `data/out/` artifacts; env `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (R2 S3 keys are separate from the API token — created once in dashboard → R2 → Manage API Tokens; document this).

- [ ] **Step 1: Write the upload script**

`pipeline/scripts/upload_r2.sh`:
```bash
#!/usr/bin/env bash
# Sync data/out/ to the moviewords-data R2 bucket via rclone's S3 backend.
# Requires: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${CLOUDFLARE_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}"
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
rclone sync data/out/ r2:moviewords-data/ --progress --checksum
echo "Synced $(du -sh data/out | cut -f1) to r2:moviewords-data"
```

`chmod +x pipeline/scripts/upload_r2.sh`

- [ ] **Step 2: Write the runbook**

`pipeline/README.md` documenting, in order: prerequisites (uv, rclone,
`TMDB_API_TOKEN` from themoviedb.org → Settings → API, R2 S3 keys from the
Cloudflare dashboard, ~60GB free disk); one-time bucket creation
(`wrangler r2 bucket create moviewords-data`); the full run:

```bash
cd pipeline
uv run python -m moviewords_pipeline.cli download   # ~15-30GB, hours
uv run python -m moviewords_pipeline.cli curate
uv run python -m moviewords_pipeline.cli index
uv run python -m moviewords_pipeline.cli count      # CPU-bound, ~1-3h
TMDB_API_TOKEN=... uv run python -m moviewords_pipeline.cli enrich  # ~1h, resumable
uv run python -m moviewords_pipeline.cli derive
cat ../data/out/report.md                            # sanity-check match rates
./scripts/upload_r2.sh
```

Note in the runbook: every stage is resumable/idempotent; `report.md` numbers
to eyeball (expect ~30-40k curated, >70% matched); re-running `derive` is cheap.
Document scope expansion explicitly: to broaden the corpus later (e.g.
`MIN_VOTES = 100`), change the threshold in `config.py` and re-run
`curate → index → count → enrich → derive` — the count and enrich per-movie
caches mean only newly-included movies get parsed/fetched. Additional languages
get their own `counts/<lang>/` cache and OPUS zip; the TMDB cache is
language-independent and shared.

- [ ] **Step 3: Update root README and commit**

Add under Status in root `README.md`: link to `pipeline/README.md` for building
the dataset.

```bash
git add pipeline README.md && git commit -m "feat(pipeline): R2 upload script and full-run runbook"
```

---

## Self-Review Notes

- Spec coverage: download/curate/clean/count/enrich/derive stages, both parquet
  sort orders, word_year, JSON hot paths, report, R2 upload, error handling
  (skip+log in counts/tmdb), all tested incl. e2e — covered. Frontend, Pages/R2
  DNS+CORS setup, and HF mirror belong to the frontend/deployment plan.
- The fixture mini-corpus doubles as the frontend plan's fixture dataset
  (`data/out` from `test_e2e` setup).
- Type consistency: `imdb_id` is tt-prefixed string everywhere; `select_best`
  takes `(name, token_estimate)` tuples and `counts.build` takes
  `(imdb_id, zip_name)` rows matching `corpus_index.parquet` columns.
- Resumability (user requirement 2026-09-11): count and enrich stages cache
  per-movie (keyed by lang + imdb_id + zip_name for counts); scope expansions
  reprocess only new items. Verified by `test_rerun_skips_cached_movies` and
  `test_changed_zip_name_invalidates_cache_entry`.
