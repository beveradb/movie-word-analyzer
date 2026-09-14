# Dual-Corpus (English originals + All films, votes >= 300) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publish the non-English-original films as a second, labeled site-wide corpus (`all/` bucket prefix) with a header toggle, and lower the IMDb vote floor from 1000 to 300 for both corpora.

**Architecture:** the pipeline's `derive` stage is parameterized by corpus (`en` keeps the `original_language = 'en'` filter and writes to `data/out/`; `all` skips it and writes to `data/out/all/`, plus a new `word_year_lang.parquet`). The bucket gains an `all/` prefix mirroring the root layout. The app resolves the active corpus once per page load (URL `?c=` > localStorage > `en`) and prefixes every data path; toggling reloads the page.

**Tech Stack:** Python 3.12 + uv + duckdb + pyarrow + pytest (pipeline); Vite + React 19 + TS + vitest (app); rclone → Cloudflare R2; GCP VM `moviewords-pipeline-tmp` for the batch run.

**Spec:** `docs/superpowers/specs/2026-09-14-dual-corpus-design.md`

## Global Constraints

- Copy style: hyphens (" - "), NEVER em-dashes (en-dash year ranges OK).
- Corpus ids are exactly `'en'` and `'all'`; bucket prefix for `all` is exactly `all/`.
- `MIN_VOTES = 300`.
- `original_language` is an ISO 639-1 string (from TMDB), never a boolean; present in BOTH corpora's artifacts (constant `'en'` in the en corpus) so schemas stay identical.
- The two parquet sort orders are load-bearing: `words_by_movie` sorted `(imdb_id, count DESC)`, `words_by_word` sorted `(word, imdb_id)`. Never break them.
- Pipeline commands run from `pipeline/` via `uv run ...`. Tests: `uv run pytest` (pipeline), `npm test` in `app/` (vitest).
- Posters are corpus-independent (`posters/<id>.jpg` at bucket root) - never corpus-prefix them.
- GCP credits expire ~2026-09-19: Tasks 12-14 (VM run, upload, deploy) must happen before then.
- All work on branch `worktree-dual-corpus` in this worktree; commit after every task.

---

### Task 1: Lower the vote floor to 300

**Files:**
- Modify: `pipeline/src/moviewords_pipeline/config.py:13`

**Interfaces:**
- Produces: `config.MIN_VOTES == 300`, consumed by `curate.run()`.

- [ ] **Step 1: Change the constant**

In `pipeline/src/moviewords_pipeline/config.py` change:

```python
MIN_VOTES = 1000
```

to:

```python
MIN_VOTES = 300
```

- [ ] **Step 2: Run the pipeline test suite**

Run: `cd pipeline && uv run pytest -q`
Expected: all tests pass (fixture films are at 2,000,000 / 2,000 / 1,900,000 / 12 votes - the 12-vote film stays excluded at 300, so no e2e expectations change).

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/moviewords_pipeline/config.py
git commit -m "feat(pipeline): lower vote floor to 300 (data-driven, see dual-corpus spec)"
```

---

### Task 2: Parameterize derive by corpus

**Files:**
- Modify: `pipeline/src/moviewords_pipeline/derive.py` (`run`, `_write_json_hot_paths`, `_write_report`)
- Modify: `pipeline/tests/fixtures/mini.ratings.tsv.gz` (regenerate: bump tt9999999 to 500 votes)
- Test: `pipeline/tests/test_e2e.py`

**Interfaces:**
- Consumes: `config.MIN_VOTES` (Task 1).
- Produces: `derive.run(corpus: str = "en")`. `corpus="en"` → language filter on, output `config.OUT_DIR`; `corpus="all"` → filter off, output `config.OUT_DIR / "all"`, extra artifact `word_year_lang.parquet` with columns `(word, year, lang, count, movie_count)`. `movies.parquet` gains column `original_language` (both corpora). Per-movie JSON gains top-level key `"original_language"`. Task 3's CLI and Task 12's runbook call this signature.

- [ ] **Step 1: Regenerate the ratings fixture (tt9999999 becomes a 500-vote film)**

```bash
cd pipeline && uv run python - <<'EOF'
import gzip
rows = ("tconst\taverageRating\tnumVotes\n"
        "tt0110912\t8.9\t2000000\n"
        "tt0000001\t5.7\t2000\n"
        "tt0903747\t9.5\t1900000\n"
        "tt9999999\t6.1\t500\n")
with gzip.open("tests/fixtures/mini.ratings.tsv.gz", "wt") as f:
    f.write(rows)
EOF
```

(tt9999999 "Obscure Film" now clears the 300 floor and gets counted; the en corpus still excludes it because the fixture only gives it a `fr` TMDB record in the new test - the two existing e2e tests give it no TMDB record at all, so it still drops at the enrich join and their assertions hold.)

- [ ] **Step 2: Write the failing test**

Append to `pipeline/tests/test_e2e.py`:

```python
def test_all_corpus_includes_non_english(data_tree, monkeypatch):
    build_zip(config.RAW_DIR / "opus_en.zip")
    (config.RAW_DIR / "title.basics.tsv.gz").write_bytes(
        (FIX / "mini.basics.tsv.gz").read_bytes())
    (config.RAW_DIR / "title.ratings.tsv.gz").write_bytes(
        (FIX / "mini.ratings.tsv.gz").read_bytes())
    tmdb_dir = config.WORK_DIR / "tmdb"
    tmdb_dir.mkdir(parents=True)
    (tmdb_dir / "tt0110912.json").write_text(json.dumps(
        {"imdb_id": "tt0110912", "countries": ["US"], "original_language": "en"}))
    (tmdb_dir / "tt9999999.json").write_text(json.dumps(
        {"imdb_id": "tt9999999", "countries": ["FR"], "original_language": "fr"}))

    curate.run(); corpus_index.run(); counts.run()
    derive.run(corpus="all")
    derive.run()  # en, default

    out_all = config.OUT_DIR / "all"
    movies = duckdb.sql(f"SELECT * FROM '{out_all / 'movies.parquet'}'").df()
    assert sorted(movies.imdb_id) == ["tt0110912", "tt9999999"]
    assert set(movies.original_language) == {"en", "fr"}

    wyl = duckdb.sql(f"SELECT * FROM '{out_all / 'word_year_lang.parquet'}'").df()
    assert set(wyl.columns) == {"word", "year", "lang", "count", "movie_count"}
    assert "fr" in set(wyl.lang)

    hot = json.loads((out_all / "json" / "movie" / "tt9999999.json").read_text())
    assert hot["original_language"] == "fr"

    # the en corpus coexists in the parent dir and still excludes the French film
    en_movies = duckdb.sql(f"SELECT * FROM '{config.OUT_DIR / 'movies.parquet'}'").df()
    assert list(en_movies.imdb_id) == ["tt0110912"]
    assert list(en_movies.original_language) == ["en"]
    assert not (config.OUT_DIR / "json" / "movie" / "tt9999999.json").exists()
    assert not (config.OUT_DIR / "word_year_lang.parquet").exists()
```

- [ ] **Step 3: Run it to verify it fails**

Run: `uv run pytest tests/test_e2e.py::test_all_corpus_includes_non_english -q`
Expected: FAIL - `TypeError: run() got an unexpected keyword argument 'corpus'`.

- [ ] **Step 4: Implement**

In `pipeline/src/moviewords_pipeline/derive.py`, replace `def run():` through the `_write_report(con, out)` call with:

```python
def run(corpus="en"):
    """Derive all published artifacts. corpus='en' (default) keeps the
    original_language filter and writes to data/out/; corpus='all' skips it -
    translated subtitles included, labeled - and writes to data/out/all/,
    adding word_year_lang.parquet for per-original-language trends."""
    out = config.OUT_DIR if corpus == "en" else config.OUT_DIR / "all"
    (out / "words_by_movie").mkdir(parents=True, exist_ok=True)
    (out / "words_by_word").mkdir(parents=True, exist_ok=True)
    (out / "json" / "movie").mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    w = config.WORK_DIR
    con.sql(f"""
        CREATE VIEW curated AS SELECT * FROM '{w / "curated.parquet"}';
        CREATE VIEW stats AS SELECT * FROM '{w / "movie_stats.parquet"}';
        CREATE VIEW wc AS SELECT * FROM '{w / "word_counts.parquet"}';
        CREATE VIEW matched AS SELECT * FROM '{w / "corpus_index.parquet"}';
        CREATE TABLE tmdb AS SELECT * FROM read_json(
            '{w / "tmdb"}/*.json',
            columns={{'imdb_id': 'VARCHAR', 'countries': 'VARCHAR[]',
                      'original_language': 'VARCHAR'}}
        );
    """)
    lang_filter = (f"WHERE t.original_language = '{config.LANG}'"
                   if corpus == "en" else "")
    con.sql(f"""
        CREATE TABLE movies AS
        SELECT c.imdb_id, c.title, c.year, t.countries, c.genres,
               c.runtime_minutes, c.rating, c.votes,
               s.total_words, s.unique_words, s.words_per_minute,
               t.original_language
        FROM curated c
        JOIN stats s USING (imdb_id)
        JOIN tmdb t USING (imdb_id)
        {lang_filter};
    """)
    con.sql(f"COPY movies TO '{out / 'movies.parquet'}' (FORMAT parquet)")

    con.sql(f"""
        COPY (
            SELECT wc.* FROM wc JOIN movies USING (imdb_id)
            ORDER BY imdb_id, count DESC
        ) TO '{out / "words_by_movie" / "data.parquet"}' (FORMAT parquet);
    """)
    con.sql(f"""
        COPY (
            SELECT wc.* FROM wc JOIN movies USING (imdb_id)
            ORDER BY word, imdb_id
        ) TO '{out / "words_by_word" / "data.parquet"}' (FORMAT parquet);
    """)
    con.sql(f"""
        COPY (
            SELECT word, year, SUM(count)::BIGINT AS count,
                   COUNT(DISTINCT wc.imdb_id) AS movie_count
            FROM wc JOIN movies USING (imdb_id)
            GROUP BY word, year
            QUALIFY SUM(SUM(count)) OVER (PARTITION BY word) >= 20
            ORDER BY word, year
        ) TO '{out / "word_year.parquet"}' (FORMAT parquet);
    """)
    if corpus == "all":
        # per-original-language trends: keep a (word, lang) pair only when its
        # corpus-wide total clears the same floor word_year uses per word
        con.sql(f"""
            COPY (
                SELECT wc.word, m.year, m.original_language AS lang,
                       SUM(wc.count)::BIGINT AS count,
                       COUNT(DISTINCT wc.imdb_id) AS movie_count
                FROM wc JOIN movies m USING (imdb_id)
                GROUP BY wc.word, m.year, m.original_language
                QUALIFY SUM(SUM(wc.count))
                    OVER (PARTITION BY wc.word, m.original_language) >= 20
                ORDER BY wc.word, lang, m.year
            ) TO '{out / "word_year_lang.parquet"}' (FORMAT parquet);
        """)

    _write_json_hot_paths(con, out)
    _write_signatures(con, out)
    _write_wordlists(out)
    _write_report(con, out, corpus)
```

In `_write_json_hot_paths`, make two changes. First:

```python
    movie_cols = ["imdb_id", "title", "year", "total_words", "unique_words",
                  "words_per_minute"]
```

becomes:

```python
    movie_cols = ["imdb_id", "title", "year", "total_words", "unique_words",
                  "words_per_minute", "original_language"]
```

Second, inside `flush`, add the field to the payload dict after `"year": m["year"],`:

```python
            "original_language": m["original_language"],
```

Replace `_write_report(con, out)` signature and the final-count lines:

```python
def _write_report(con, out, corpus):
    n = lambda q: con.sql(q).fetchone()[0]
    curated_n = n("SELECT COUNT(*) FROM curated")
    matched_n = n("SELECT COUNT(*) FROM matched")
    counted_n = n("SELECT COUNT(*) FROM stats")
    enriched_n = n("SELECT COUNT(*) FROM tmdb WHERE imdb_id IS NOT NULL")
    final_n = n("SELECT COUNT(*) FROM movies")
    kind = ("English-original movies" if corpus == "en"
            else "movies, all original languages")
    report = (
        f"# Pipeline report - corpus '{corpus}'\n\n"
        f"- curated (IMDb movies meeting the vote threshold): {curated_n}\n"
        f"- matched (subtitle file found in OpenSubtitles corpus): {matched_n}\n"
        f"- counted (word counts + stats computed): {counted_n}\n"
        f"- enriched (TMDB metadata found): {enriched_n}\n"
        f"- final ({kind} published): {final_n}\n\n"
        "## Drop reasons\n\n"
        f"- curated → matched ({curated_n - matched_n} dropped): no usable "
        "subtitle file found in the OpenSubtitles corpus\n"
        f"- matched → counted ({matched_n - counted_n} dropped): subtitle "
        "file failed word counting (unparseable)\n"
        f"- counted → enriched ({counted_n - enriched_n} dropped): no TMDB "
        "match found for the IMDb id\n"
        + (f"- enriched → final ({enriched_n - final_n} dropped): TMDB "
           f"original_language was not '{config.LANG}'\n" if corpus == "en" else "")
    )
    (out / "report.md").write_text(report)
```

- [ ] **Step 5: Run the full pipeline suite**

Run: `uv run pytest -q`
Expected: all pass, including the new test and the two pre-existing e2e tests.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/moviewords_pipeline/derive.py pipeline/tests/test_e2e.py pipeline/tests/fixtures/mini.ratings.tsv.gz
git commit -m "feat(pipeline): derive is corpus-parameterized (en|all) with original_language + word_year_lang"
```

---

### Task 3: CLI `--corpus` flag for derive

**Files:**
- Modify: `pipeline/src/moviewords_pipeline/cli.py`
- Test: `pipeline/tests/test_cli.py`

**Interfaces:**
- Consumes: `derive.run(corpus=...)` (Task 2).
- Produces: `uv run python -m moviewords_pipeline.cli derive --corpus en|all` (used by the Task 12 runbook).

- [ ] **Step 1: Write the failing test**

Append to `pipeline/tests/test_cli.py`:

```python
def test_derive_accepts_corpus_flag(monkeypatch):
    calls = []
    import moviewords_pipeline.derive as derive_mod
    monkeypatch.setattr(derive_mod, "run",
                        lambda corpus="en": calls.append(corpus))
    main(["derive", "--corpus", "all"])
    main(["derive"])
    assert calls == ["all", "en"]
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run pytest tests/test_cli.py -q`
Expected: FAIL - `unrecognized arguments: --corpus all`.

- [ ] **Step 3: Implement**

In `pipeline/src/moviewords_pipeline/cli.py`, replace `main` with:

```python
def main(argv=None):
    parser = argparse.ArgumentParser(prog="moviewords-pipeline")
    sub = parser.add_subparsers(dest="stage", required=True)
    for stage in STAGES:
        p = sub.add_parser(stage)
        if stage == "derive":
            p.add_argument("--corpus", default="en", choices=["en", "all"])
    args = parser.parse_args(argv)
    # stage runners are registered as tasks land; import lazily
    from importlib import import_module
    mod = import_module(f"moviewords_pipeline.{_module_for(args.stage)}")
    if args.stage == "derive":
        mod.run(corpus=args.corpus)
    else:
        mod.run()
```

- [ ] **Step 4: Run tests, then commit**

Run: `uv run pytest tests/test_cli.py -q` - expected: PASS.

```bash
git add pipeline/src/moviewords_pipeline/cli.py pipeline/tests/test_cli.py
git commit -m "feat(pipeline): cli derive --corpus en|all"
```

---

### Task 4: `build_movies_index.py` script (replaces the README heredoc)

**Files:**
- Create: `pipeline/scripts/build_movies_index.py`
- Modify: `pipeline/README.md` (replace the heredoc block at ~line 86-92)
- Test: `pipeline/tests/test_movies_index.py`

**Interfaces:**
- Consumes: `movies.parquet` with `original_language` column (Task 2).
- Produces: `json/movies-index.json` entries `{id, title, year, rating, votes, total_words, unique_words, genres, lang}` sorted by votes DESC. The app (Task 8) reads `lang`. Importable as `build(movies_parquet, dest) -> int`.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/test_movies_index.py`:

```python
import json

import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401  (see step 2)


def test_build_movies_index(tmp_path):
    from build_movies_index import build
    src = tmp_path / "movies.parquet"
    duckdb.sql("""
        SELECT * FROM (VALUES
            ('tt1', 'Big Hit', 1999, 8.1, 900000, 12000, 3000,
             ['Drama'], 'en'),
            ('tt2', 'Petit Film', 2001, 7.0, 450, 6000, 2000,
             ['Comedy'], 'fr')
        ) t(imdb_id, title, year, rating, votes, total_words, unique_words,
            genres, original_language)
    """).write_parquet(str(src))
    dest = tmp_path / "json" / "movies-index.json"
    n = build(src, dest)
    assert n == 2
    idx = json.loads(dest.read_text())
    assert [m["id"] for m in idx] == ["tt1", "tt2"]  # votes DESC
    assert idx[1] == {"id": "tt2", "title": "Petit Film", "year": 2001,
                      "rating": 7.0, "votes": 450, "total_words": 6000,
                      "unique_words": 2000, "genres": ["Comedy"], "lang": "fr"}
```

- [ ] **Step 2: Make scripts importable from tests**

Create `pipeline/tests/scripts_path.py`:

```python
"""Puts pipeline/scripts on sys.path so tests can import script modules."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
add_scripts_to_path = True
```

Run: `uv run pytest tests/test_movies_index.py -q`
Expected: FAIL - `ModuleNotFoundError: No module named 'build_movies_index'`.

- [ ] **Step 3: Implement**

Create `pipeline/scripts/build_movies_index.py`:

```python
"""Build json/movies-index.json - the slim all-movies client-side search
index. Run per corpus after derive:

  uv run python scripts/build_movies_index.py [--corpus en|all]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402

from moviewords_pipeline import config  # noqa: E402


def build(movies_parquet, dest):
    rows = duckdb.sql(f"""
        SELECT imdb_id, title, year, rating, votes, total_words,
               unique_words, genres, original_language
        FROM '{movies_parquet}' ORDER BY votes DESC
    """).fetchall()
    out = [{"id": r[0], "title": r[1], "year": r[2], "rating": r[3],
            "votes": r[4], "total_words": r[5], "unique_words": r[6],
            "genres": r[7], "lang": r[8]} for r in rows]
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out))
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="en", choices=["en", "all"])
    args = ap.parse_args()
    out = config.OUT_DIR if args.corpus == "en" else config.OUT_DIR / "all"
    n = build(out / "movies.parquet", out / "json" / "movies-index.json")
    print(f"wrote {n} entries ({args.corpus})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_movies_index.py -q` - expected: PASS.

- [ ] **Step 5: Update the runbook**

In `pipeline/README.md`, replace the whole `uv run python - <<'EOF' ... EOF` movies-index block (under "# Build the client-side search index") with:

```bash
# Build the client-side search index (deploy artifact consumed by the app)
uv run python scripts/build_movies_index.py --corpus en
uv run python scripts/build_movies_index.py --corpus all
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/scripts/build_movies_index.py pipeline/tests/test_movies_index.py pipeline/tests/scripts_path.py pipeline/README.md
git commit -m "feat(pipeline): build_movies_index script with lang field, per corpus"
```

---

### Task 5: Votes floor for film superlatives boards

**Files:**
- Modify: `pipeline/src/moviewords_pipeline/boards.py` (`film_superlatives`)
- Test: `pipeline/tests/test_boards.py`

**Interfaces:**
- Consumes: `movies` view (now guaranteed to have a `votes` column in both corpora).
- Produces: `film_superlatives(con, profanity, min_words=5000, top_n=20, min_votes=1000)` - films below `min_votes` never appear in any superlative list. `rebuild_web_data.stage_boards` picks up the default automatically.

- [ ] **Step 1: Update the fixture and write the failing test**

In `pipeline/tests/test_boards.py`, change the movies table DDL and inserts to include votes:

```python
        CREATE TABLE movies (imdb_id VARCHAR, title VARCHAR, year INT,
            runtime_minutes INT, total_words BIGINT, unique_words BIGINT,
            words_per_minute DOUBLE, votes BIGINT);
        INSERT INTO movies VALUES
            ('tt1', 'Fast Talker', 1994, 100, 12000, 3000, 120.0, 50000),
            ('tt2', 'Slow Burn',   2001, 100,  6000, 2400,  60.0, 50000),
            ('tt3', 'Sweary Song', 2010, 100,  8000,  800,  80.0, 50000);
```

Append a new test:

```python
def test_film_superlatives_votes_floor(con):
    # an obscure film that would otherwise sweep every superlative
    con.sql("""
        INSERT INTO movies VALUES
            ('tt4', 'Obscure Sweep', 2015, 100, 30000, 20000, 240.0, 400);
        INSERT INTO words_by_movie VALUES ('tt4', 'fuck', 5000);
    """)
    out = film_superlatives(con, profanity={"fuck"}, min_words=5000)
    for board in ("chattiest", "vocabulary", "sweariest", "repetitive"):
        assert all(r["id"] != "tt4" for r in out[board]), board
    # explicit floor of 0 lets it through - the guard is the parameter
    out = film_superlatives(con, profanity={"fuck"}, min_words=5000, min_votes=0)
    assert out["vocabulary"][0]["id"] == "tt4"
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `uv run pytest tests/test_boards.py -q`
Expected: `test_film_superlatives_votes_floor` FAILS (tt4 tops the boards); the pre-existing tests pass (their films now all have 50,000 votes).

- [ ] **Step 3: Implement**

In `boards.py`, change the signature and each query:

```python
def film_superlatives(con, profanity, min_words=5000, top_n=20, min_votes=1000):
    """Chattiest (words/min), biggest vocabulary, sweariest (profanity/1k),
    most repetitive (lowest unique/total). Chattiest is guarded against bad
    runtime metadata (needs a feature-length runtime and a sane rate).
    `min_votes` keeps one obscure film with a rough subtitle from topping a
    corpus-wide board now that the corpus floor is 300 votes.
    """
```

Add the votes condition to all four queries:
- chattiest: `... AND total_words >= {min_words} AND words_per_minute < 250 AND votes >= {min_votes}`
- vocabulary: `SELECT imdb_id, title, year, unique_words FROM movies WHERE votes >= {min_votes} ORDER BY unique_words DESC LIMIT {top_n}`
- repetitive: `... WHERE total_words >= {min_words} AND votes >= {min_votes}`
- sweariest: `... WHERE w.word IN ({placeholders}) AND m.total_words >= {min_words} AND m.votes >= {min_votes}`

- [ ] **Step 4: Run tests, then commit**

Run: `uv run pytest tests/test_boards.py -q` - expected: PASS.

```bash
git add pipeline/src/moviewords_pipeline/boards.py pipeline/tests/test_boards.py
git commit -m "feat(pipeline): votes>=1000 eligibility floor for film superlatives"
```

---

### Task 6: `--corpus` for rebuild_web_data.py and fetch_published.sh

**Files:**
- Modify: `pipeline/scripts/rebuild_web_data.py`
- Modify: `pipeline/scripts/fetch_published.sh`

**Interfaces:**
- Consumes: published/derived artifact layouts (root and `all/`).
- Produces: `rebuild_web_data.py --corpus en|all [--stage ...]` reading `webdata/in[/all]` and writing `webdata/out[/all]`; `fetch_published.sh [all]` mirroring `all/`-prefixed remote paths into `webdata/in/all`. Task 12's runbook uses both.

- [ ] **Step 1: Implement rebuild_web_data corpus switch**

In `pipeline/scripts/rebuild_web_data.py`, after `IN, OUT = ROOT / "in", ROOT / "out"` add:

```python
def set_corpus(corpus):
    """Point IN/OUT at the corpus subtree. 'en' keeps the historical flat
    layout; 'all' nests under all/ mirroring the bucket prefix."""
    global IN, OUT
    sub = () if corpus == "en" else ("all",)
    IN = ROOT.joinpath("in", *sub)
    OUT = ROOT.joinpath("out", *sub)
```

Note: every stage already reads the module globals `IN`/`OUT` at call time (inside function bodies), so mutating them before any stage runs is safe.

In `main()`, add the flag and call it first:

```python
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all", choices=["all", *STAGES])
    ap.add_argument("--corpus", default="en", choices=["en", "all"])
    args = ap.parse_args()
    set_corpus(args.corpus)
    OUT.mkdir(parents=True, exist_ok=True)
    for name in STAGES if args.stage == "all" else [args.stage]:
        t0 = time.time()
        print(f"stage {name}… (corpus {args.corpus})", flush=True)
        STAGES[name](connect())
        print(f"stage {name} done in {time.time() - t0:.0f}s", flush=True)
```

Also update the module docstring's Usage lines to mention `[--corpus en|all]`.

- [ ] **Step 2: Implement fetch_published.sh corpus arg**

Replace the body after `set -euo pipefail` header lines with:

```bash
CORPUS="${1:-en}"
BASE="${DATA_BASE:-https://data.moviewords.org}"
if [ "$CORPUS" = "all" ]; then
  PREFIX="all/"
  DEST="$(dirname "$0")/../webdata/in/all"
else
  PREFIX=""
  DEST="$(dirname "$0")/../webdata/in"
fi
mkdir -p "$DEST/signature"
```

and prefix every remote path in the `fetch` calls:

```bash
fetch "${PREFIX}movies.parquet" movies.parquet
fetch "${PREFIX}word_year.parquet" word_year.parquet
fetch "${PREFIX}words_by_movie/data.parquet" words_by_movie.parquet
fetch "${PREFIX}json/signature/decades.json" signature/decades.json
fetch "${PREFIX}json/signature/genres.json" signature/genres.json
```

(The `fetch()` function itself is unchanged.)

- [ ] **Step 3: Smoke-test both (en path only - all/ isn't published yet)**

Run: `cd pipeline && uv run python scripts/rebuild_web_data.py --help`
Expected: shows `--corpus {en,all}`.
Run: `bash -n scripts/fetch_published.sh`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add pipeline/scripts/rebuild_web_data.py pipeline/scripts/fetch_published.sh
git commit -m "feat(pipeline): --corpus for rebuild_web_data + fetch_published"
```

---

### Task 7: App corpus registry (`corpus.ts`)

**Files:**
- Create: `app/src/lib/corpus.ts`
- Test: `app/src/lib/corpus.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 8-10):
  - `interface Corpus { id: 'en' | 'all'; prefix: string; label: string; short: string; description: string }`
  - `CORPORA: Record<string, Corpus>`
  - `resolveCorpus(search: string, stored: string | null): Corpus` (pure)
  - `activeCorpus(): Corpus` (lazy singleton - safe to import in node test env)
  - `switchCorpus(id: 'en' | 'all'): void` (persists + reloads with `?c=` set/cleared)

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/corpus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CORPORA, resolveCorpus } from './corpus'

describe('resolveCorpus', () => {
  it('defaults to en', () => {
    expect(resolveCorpus('', null).id).toBe('en')
  })
  it('URL param wins over stored preference', () => {
    expect(resolveCorpus('?c=all', 'en').id).toBe('all')
    expect(resolveCorpus('?c=en', 'all').id).toBe('en')
  })
  it('falls back to stored preference when no param', () => {
    expect(resolveCorpus('', 'all').id).toBe('all')
  })
  it('ignores unknown values from URL and storage', () => {
    expect(resolveCorpus('?c=klingon', 'bogus').id).toBe('en')
  })
  it('registry carries bucket prefixes', () => {
    expect(CORPORA.en.prefix).toBe('')
    expect(CORPORA.all.prefix).toBe('all/')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd app && npx vitest run src/lib/corpus.test.ts`
Expected: FAIL - cannot resolve `./corpus`.

- [ ] **Step 3: Implement**

Create `app/src/lib/corpus.ts`:

```ts
/** Corpus registry - the ONLY place corpus ids, bucket prefixes, and corpus
 * copy live. A future subtitle-language corpus or per-language filter adds
 * entries/params here without touching consumers. */
export interface Corpus {
  id: 'en' | 'all'
  /** bucket path prefix ('' or 'all/'); posters stay unprefixed */
  prefix: string
  label: string
  /** compact header-toggle text */
  short: string
  description: string
}

export const CORPORA: Record<string, Corpus> = {
  en: {
    id: 'en',
    prefix: '',
    label: 'English originals',
    short: 'English',
    description:
      'Films originally written in English - subtitles measure the screenwriters.',
  },
  all: {
    id: 'all',
    prefix: 'all/',
    label: 'All films',
    short: 'All films',
    description:
      'Every film, translated subtitles included - counts for non-English originals measure the English translation.',
  },
}

const STORAGE_KEY = 'corpus'

/** Pure resolver: URL ?c= wins, then stored preference, then 'en'. */
export function resolveCorpus(search: string, stored: string | null): Corpus {
  const fromUrl = new URLSearchParams(search).get('c')
  if (fromUrl && CORPORA[fromUrl]) return CORPORA[fromUrl]
  if (stored && CORPORA[stored]) return CORPORA[stored]
  return CORPORA.en
}

let active: Corpus | null = null

/** The corpus for this page load. Toggling reloads the page, so downstream
 * code treats this as a constant - no reactivity anywhere. Lazy so importing
 * this module in a node test environment never touches window. */
export function activeCorpus(): Corpus {
  if (!active) {
    active = resolveCorpus(window.location.search, localStorage.getItem(STORAGE_KEY))
  }
  return active
}

/** Switch corpus: persist the preference and reload with ?c= reflecting the
 * choice (cleared for the default), so shared URLs reproduce the view. The
 * hash route survives the reload untouched. */
export function switchCorpus(id: Corpus['id']): void {
  localStorage.setItem(STORAGE_KEY, id)
  const url = new URL(window.location.href)
  if (id === 'en') url.searchParams.delete('c')
  else url.searchParams.set('c', id)
  window.location.href = url.toString()
}
```

- [ ] **Step 4: Run tests, then commit**

Run: `npx vitest run src/lib/corpus.test.ts` - expected: PASS.

```bash
git add app/src/lib/corpus.ts app/src/lib/corpus.test.ts
git commit -m "feat(app): corpus registry + resolution (url > storage > default)"
```

---

### Task 8: Corpus-prefixed data access + `lang` types

**Files:**
- Modify: `app/src/lib/data.ts`
- Modify: `app/src/lib/duck.ts:56`

**Interfaces:**
- Consumes: `activeCorpus()` (Task 7).
- Produces: `dataUrl(path: string): string` exported from `data.ts`; every `fetchJSON` path and `pq()` parquet read is corpus-prefixed. `MovieIndexEntry.lang?: string`; `MovieDetail.original_language?: string` (optional - the currently-published en JSONs predate the field). Poster URLs are NOT touched.

- [ ] **Step 1: Implement data.ts changes**

In `app/src/lib/data.ts`:

Add the import at the top:

```ts
import { activeCorpus } from './corpus'
```

After the `DATA_BASE` export add:

```ts
/** Corpus-scoped data URL. Posters are corpus-independent and keep using
 * DATA_BASE directly - everything else lives under the corpus prefix. */
export const dataUrl = (path: string) => `${DATA_BASE}/${activeCorpus().prefix}${path}`
```

In `fetchJSON`, change:

```ts
    const p = fetch(`${DATA_BASE}/${path}`).then((res) => {
```

to:

```ts
    const p = fetch(dataUrl(path)).then((res) => {
```

Add the optional fields:

```ts
export interface MovieIndexEntry {
  id: string
  title: string
  year: number
  rating: number
  votes: number
  total_words: number
  unique_words: number
  genres: string[]
  /** ISO 639-1 original language - present in indexes built after 2026-09-14 */
  lang?: string
}
```

and in `MovieDetail`, after `year: number`:

```ts
  original_language?: string
```

- [ ] **Step 2: Implement duck.ts change**

In `app/src/lib/duck.ts`, change the import and `pq`:

```ts
import { DATA_BASE, dataUrl } from './data'
```

(keep `DATA_BASE` if still referenced; if not, import only `dataUrl`), and:

```ts
export const pq = (name: string) => `read_parquet('${dataUrl(name)}')`
```

- [ ] **Step 3: Type-check, test, verify en behavior unchanged**

Run: `cd app && npx tsc --noEmit && npm test`
Expected: clean; all vitest suites pass.
Run: `npm run dev` (port 5173), open http://localhost:5173 - homepage loads as before (en corpus, prefix '').

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/data.ts app/src/lib/duck.ts
git commit -m "feat(app): corpus-prefixed data paths + lang fields on movie types"
```

---

### Task 9: Header corpus toggle

**Files:**
- Modify: `app/src/App.tsx` (add `CorpusToggle`, render next to `ThemeToggle`)

**Interfaces:**
- Consumes: `CORPORA`, `activeCorpus`, `switchCorpus` (Task 7).
- Produces: header control - two-state segmented switch, active corpus highlighted.

- [ ] **Step 1: Implement**

In `app/src/App.tsx`, add the import:

```ts
import { CORPORA, activeCorpus, switchCorpus } from './lib/corpus'
```

Add the component after `ThemeToggle`:

```tsx
/** Corpus switch: English originals (default) vs all films with translated
 * subtitles. Switching persists + reloads - see lib/corpus.ts. */
function CorpusToggle() {
  const corpus = activeCorpus()
  return (
    <div
      role="group"
      aria-label="Film corpus"
      className="flex items-center border-2 border-ink font-script text-sm font-bold"
    >
      {Object.values(CORPORA).map((c) => (
        <button
          key={c.id}
          onClick={() => corpus.id !== c.id && switchCorpus(c.id)}
          aria-pressed={corpus.id === c.id}
          title={c.description}
          className={`px-2.5 py-1 uppercase ${
            corpus.id === c.id ? 'bg-ink text-paper' : 'hover:bg-mark'
          }`}
        >
          {c.short}
        </button>
      ))}
    </div>
  )
}
```

Render it in the header - change:

```tsx
          <ThemeToggle />
```

to:

```tsx
          <CorpusToggle />
          <ThemeToggle />
```

- [ ] **Step 2: Verify in the browser**

Run: `cd app && npm run dev`, open http://localhost:5173.
Expected: toggle renders; clicking "ALL FILMS" reloads with `?c=all` in the URL (data requests will 404 until the `all/` dataset is uploaded - that's expected for now); clicking "ENGLISH" reloads back and clears the param; the choice sticks across a manual reload (localStorage).

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit` - expected: clean.

```bash
git add app/src/App.tsx
git commit -m "feat(app): header corpus toggle (English originals | All films)"
```

---

### Task 10: Translated-subtitles badge + corpus-aware hero copy

**Files:**
- Modify: `app/src/components/ui.tsx` (add `LangBadge`; badge in `MovieSearch` result rows)
- Modify: `app/src/views/Movie.tsx` (badge next to genres in the `Slug`)
- Modify: `app/src/views/Home.tsx:119` (hero copy)

**Interfaces:**
- Consumes: `activeCorpus()` (Task 7), `MovieIndexEntry.lang` (Task 8).
- Produces: `LangBadge({ lang, className }): JSX | null` exported from `ui.tsx` - renders only in the `all` corpus for a non-`en` language.

- [ ] **Step 1: Add LangBadge to ui.tsx**

Add the import in `app/src/components/ui.tsx`:

```ts
import { activeCorpus } from '../lib/corpus'
```

Add the component (near `Poster`):

```tsx
/** "translated" marker for non-English originals - only meaningful (and only
 * shown) in the all-films corpus; the en corpus is English-only by cut. */
export function LangBadge({ lang, className = '' }: { lang?: string; className?: string }) {
  if (activeCorpus().id !== 'all' || !lang || lang === 'en') return null
  let name = lang.toUpperCase()
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? name
  } catch {
    // unknown/invalid code: keep the raw code
  }
  return (
    <span
      className={`shrink-0 border border-ink-2 px-1 text-[10px] uppercase tracking-wide text-ink-2 ${className}`}
      title={`Original language ${name} - counts come from the English translated subtitles`}
    >
      translated · {name}
    </span>
  )
}
```

- [ ] **Step 2: Badge in MovieSearch result rows**

In the `MovieSearch` results list in `ui.tsx`, change the row button content:

```tsx
                <span className="truncate">{m.title}</span>
                <span className="ml-3 shrink-0 text-sm text-ink-2">{m.year}</span>
```

to:

```tsx
                <span className="truncate">{m.title}</span>
                <span className="ml-3 flex shrink-0 items-baseline gap-1.5">
                  <LangBadge lang={m.lang} />
                  <span className="text-sm text-ink-2">{m.year}</span>
                </span>
```

(`LangBadge` is defined in the same file - no import needed.)

- [ ] **Step 3: Badge on the movie page**

In `app/src/views/Movie.tsx`, add `LangBadge` to the ui import:

```ts
import { ErrorBox, HighlightWord, LangBadge, Poster, Slug, Spinner } from '../components/ui'
```

and in the `Slug`'s `right` prop, prepend the badge inside the outer span:

```tsx
        right={
          <span className="inline-flex items-baseline gap-2">
            <LangBadge lang={meta?.lang ?? movie.original_language} />
            <span>
              {[...new Set(meta?.genres ?? [])].slice(0, 3).map((g, i) => (
                <span key={g}>
                  {i > 0 && ' / '}
                  <a href={`#/genre/${encodeURIComponent(g)}`} className="hover:bg-mark">
                    {g}
                  </a>
                </span>
              ))}
            </span>
          </span>
        }
```

- [ ] **Step 4: Corpus-aware hero copy in Home.tsx**

Add the import:

```ts
import { activeCorpus } from '../lib/corpus'
```

Change line ~119:

```tsx
          Covering <strong>{count ? count.toLocaleString() : '18,000+'} English-original films</strong> - every word
```

to:

```tsx
          Covering{' '}
          <strong>
            {count ? count.toLocaleString() : 'tens of thousands of'}{' '}
            {activeCorpus().id === 'all'
              ? 'films - translated subtitles included'
              : 'English-original films'}
          </strong>{' '}
          - every word
```

and in the same sentence change `movies with at least 1,000 IMDb votes` to `movies with at least 300 IMDb votes`.

- [ ] **Step 5: Type-check, test, verify, commit**

Run: `cd app && npx tsc --noEmit && npm test` - expected: clean/pass.
Run: `npm run dev`, check the movie page and search still render in en mode (badges absent by design).

```bash
git add app/src/components/ui.tsx app/src/views/Movie.tsx app/src/views/Home.tsx
git commit -m "feat(app): translated-subtitles badges + corpus-aware hero copy"
```

---

### Task 11: Docs and footer copy

**Files:**
- Modify: `docs/FAQ.md` (the "Why English-original films only?" section, ~line 34, and the poster-count line ~115)
- Modify: `docs/DATA.md`, `docs/ARCHITECTURE.md`, `README.md:4`
- Modify: `app/src/App.tsx` footer ("five Parquet files" sentence)

**Interfaces:** none - copy only. Style rule: " - ", never em-dashes.

- [ ] **Step 1: FAQ.md**

Retitle the section "Why English-original films only?" to "What about non-English films?" and replace its body with (adapting surrounding text as needed):

```markdown
### What about non-English films?

They're in - as a second, clearly labeled corpus. The default view covers
films originally written in English, because a translated subtitle measures
the translator as much as the screenwriter. The header toggle switches the
whole site to "All films", which adds every non-English-original film in the
cut (badged with its original language). Same methodology, two honest
datasets - pick the one that matches your question.
```

Update the poster-count heading (~line 115) from `~18,758` to `~50,000` (check the actual final count from the Task 12 report first and use that figure rounded).

Also update any FAQ mention of the 1,000-vote floor to 300.

- [ ] **Step 2: README.md line 4**

Change the `**18,761 English-original films**` headline sentence to reflect both corpora, e.g.:

```markdown
**Two corpora: ~27k English-original films (default) and ~50k films of every
original language** (translated subtitles, clearly labeled): what any movie
actually says, how words rise
```

(substitute the real counts from the Task 12 pipeline reports; keep the rest of the sentence).

- [ ] **Step 3: docs/DATA.md**

Add a section after the artifact table:

```markdown
## Two corpora

Every artifact exists twice: at the bucket root for the default corpus
(English-original films) and under the `all/` prefix for the all-films
corpus (translated subtitles included), e.g.
`https://data.moviewords.org/all/movies.parquet`. Both use `numVotes >= 300`.
`movies.parquet` carries `original_language` (ISO 639-1) in both corpora.

The all-films corpus adds `all/word_year_lang.parquet`
`(word, year, lang, count, movie_count)` - per-original-language trend
counts, keeping a (word, lang) pair when its corpus-wide total is >= 20.
Posters are shared at `posters/<imdb_id>.jpg` regardless of corpus.
```

Update the vote-floor mention(s) from 1,000 to 300 and add `original_language`
to the movies.parquet schema listing.

- [ ] **Step 4: docs/ARCHITECTURE.md**

- "Corpus cut" paragraph: change `numVotes ≥ 1000` to `numVotes ≥ 300`, and replace the "counted and cached but not published; that's a one-flag change" parenthetical with a sentence stating both corpora are published and the toggle ships in the app.
- Dataset-contract table: add a row `all/*` ("mirror of every artifact for the all-films corpus") and a row `all/word_year_lang.parquet`.
- Key decisions log entry 6: append " - superseded 2026-09-14: the all-films corpus now ships as a labeled toggle (see the dual-corpus spec)."

- [ ] **Step 5: Footer in App.tsx**

Change "The full dataset is five Parquet files on a public bucket" to
"The full dataset is two corpora of Parquet files (English originals, plus
all films under `all/`) on a public bucket".

- [ ] **Step 6: Type-check and commit**

Run: `cd app && npx tsc --noEmit` - expected: clean.

```bash
git add docs/FAQ.md docs/DATA.md docs/ARCHITECTURE.md README.md app/src/App.tsx
git commit -m "docs: dual-corpus + votes>=300 across FAQ, DATA, ARCHITECTURE, README, footer"
```

---

### Task 12: Ship gate, then batch run on the VM

**Files:** none locally (operational). Prereq: Tasks 1-11 merged to `main` via the project's ship flow (`/test` → `/test-review` → `/docs-review` → subagent review - CodeRabbit CLI is SSO-blocked on this repo → `/pr` without the ignore line → merge). The app deploy waits for Task 14.

**Interfaces:**
- Consumes: merged main; VM caches (33,380 counts, 33,390 tmdb); `TMDB_API_KEY` from `/Users/andrew/Projects/beveradb/moviewords/.envrc`.
- Produces: on the VM - `data/out/` (en) and `data/out/all/` complete incl. movies-index; `pipeline/webdata/out[/all]/json/{leaderboards,signature,featured-series.json}`; posters for all new films; two `report.md`s whose counts feed back into Task 11's placeholder numbers.

- [ ] **Step 1: Sync code and refresh IMDb dumps on the VM**

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer && git fetch origin && git checkout main && git pull &&
  rm -f data/raw/title.basics.tsv.gz data/raw/title.ratings.tsv.gz &&
  cd pipeline && /root/.local/bin/uv run python -m moviewords_pipeline.cli download
"'
```

Expected: re-downloads only the two IMDb TSVs (~1 min; the 34GB OPUS zip is cached).

- [ ] **Step 2: curate + index + count (fast, run synchronously)**

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer/pipeline &&
  /root/.local/bin/uv run python -m moviewords_pipeline.cli curate &&
  /root/.local/bin/uv run python -m moviewords_pipeline.cli index &&
  nohup /root/.local/bin/uv run python -m moviewords_pipeline.cli count > /var/log/mw-count2.log 2>&1 && touch /opt/COUNT2_DONE &
"' 
```

Poll until done (expect ~10-25 min - only new films are parsed, 33,380 come from cache):

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='ls /opt/COUNT2_DONE 2>/dev/null; sudo tail -2 /var/log/mw-count2.log'
```

- [ ] **Step 3: enrich new films (TMDB, ~20-40 min)**

Get the key locally: `grep TMDB_API_KEY /Users/andrew/Projects/beveradb/moviewords/.envrc`. Then:

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer/pipeline &&
  nohup env TMDB_API_KEY=<KEY> /root/.local/bin/uv run python -m moviewords_pipeline.cli enrich > /var/log/mw-enrich2.log 2>&1 && touch /opt/ENRICH2_DONE &
"'
```

Poll `/opt/ENRICH2_DONE` + tail the log as in Step 2.

- [ ] **Step 4: derive both corpora + movies-index**

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer/pipeline &&
  nohup bash -c \"/root/.local/bin/uv run python -m moviewords_pipeline.cli derive --corpus en &&
  /root/.local/bin/uv run python -m moviewords_pipeline.cli derive --corpus all &&
  /root/.local/bin/uv run python scripts/build_movies_index.py --corpus en &&
  /root/.local/bin/uv run python scripts/build_movies_index.py --corpus all &&
  touch /opt/DERIVE2_DONE\" > /var/log/mw-derive2.log 2>&1 &
"'
```

Poll `/opt/DERIVE2_DONE`. Then sanity-check and RECORD THE COUNTS (they feed Task 11's copy):

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo cat /opt/movie-word-analyzer/data/out/report.md /opt/movie-word-analyzer/data/out/all/report.md'
```

Expected: en final ~26-28k, all final ~50k; en < all; both >> 18,761. If Task 11 used placeholder counts, update the docs now with the real ones (commit to main directly is NOT allowed - fold into the Task 14 verification PR if needed, or update docs before the Task 12 PR merges by running derive on the branch).

- [ ] **Step 5: rebuild_web_data per corpus (boards, extended signatures, featured)**

The rebuild script reads `webdata/in[/all]` - symlink derive's outputs (in/ is never uploaded; the one webdata/out artifact it needs, word_meta, gets a real copy because rclone skips symlinks):

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer/pipeline &&
  mkdir -p webdata/in/all/signature webdata/in/signature webdata/out/all &&
  D=/opt/movie-word-analyzer/data/out &&
  ln -sf \$D/movies.parquet webdata/in/movies.parquet &&
  ln -sf \$D/words_by_movie/data.parquet webdata/in/words_by_movie.parquet &&
  ln -sf \$D/word_year.parquet webdata/in/word_year.parquet &&
  ln -sf \$D/json/signature/decades.json webdata/in/signature/decades.json &&
  ln -sf \$D/json/signature/genres.json webdata/in/signature/genres.json &&
  cp \$D/word_meta.parquet webdata/out/word_meta.parquet &&
  ln -sf \$D/all/movies.parquet webdata/in/all/movies.parquet &&
  ln -sf \$D/all/words_by_movie/data.parquet webdata/in/all/words_by_movie.parquet &&
  ln -sf \$D/all/word_year.parquet webdata/in/all/word_year.parquet &&
  ln -sf \$D/all/json/signature/decades.json webdata/in/all/signature/decades.json &&
  ln -sf \$D/all/json/signature/genres.json webdata/in/all/signature/genres.json &&
  cp \$D/all/word_meta.parquet webdata/out/all/word_meta.parquet &&
  for c in en all; do for s in boards signatures featured; do
    /root/.local/bin/uv run python scripts/rebuild_web_data.py --corpus \$c --stage \$s || exit 1
  done; done && touch /opt/REBUILD2_DONE
"'
```

(The meta and movies stages are intentionally skipped - derive already writes word_meta, leaderboard-default and the per-movie JSONs in the same format.)

- [ ] **Step 6: posters for new films (~40 min)**

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer/pipeline &&
  nohup env TMDB_API_KEY=<KEY> /root/.local/bin/uv run python scripts/fetch_posters.py --workers 8 > /var/log/mw-posters2.log 2>&1 && touch /opt/POSTERS2_DONE &
"'
```

Note: `fetch_posters.py` reads `data/out/movies.parquet` (en). Check whether it selects ids from the movies parquet - if so, run it a second time after pointing it at `data/out/all/movies.parquet` (it takes the union of what exists; existing files are skipped). If the script hardcodes the en path, run:

```bash
sudo env TMDB_API_KEY=<KEY> /root/.local/bin/uv run python - <<'EOF'
# poster fetch over the ALL corpus (superset) - reuses fetch_posters helpers
import sys
from pathlib import Path
sys.path.insert(0, "/opt/movie-word-analyzer/pipeline/scripts")
sys.path.insert(0, "/opt/movie-word-analyzer/pipeline/src")
import duckdb
from concurrent.futures import ThreadPoolExecutor
from fetch_posters import fetch_one
from moviewords_pipeline import config
from moviewords_pipeline.tmdb import make_session
ids = [r[0] for r in duckdb.sql(
    f"SELECT imdb_id FROM '{config.OUT_DIR / 'all' / 'movies.parquet'}'").fetchall()]
dest = config.OUT_DIR / "posters"; dest.mkdir(exist_ok=True)
s = make_session()
with ThreadPoolExecutor(8) as ex:
    list(ex.map(lambda i: fetch_one(s, i, dest, "w342"), ids))
EOF
```

(Adapt to `fetch_one`'s actual signature - read the script first.)

---

### Task 13: Upload to R2 + purge

**Files:** none (operational, run on the VM).

**Interfaces:**
- Consumes: Task 12 outputs; R2 S3 creds derived from `CLOUDFLARE_API_TOKEN` in `~/Projects/beveradb/.envrc`; `MOVIEWORDS_CF_TOKEN` from `moviewords/.envrc` (zone id `cac867b68baf009c1913495f2012353b`).
- Produces: complete `all/` tree + refreshed root artifacts + new posters in `r2:moviewords-data`, edge purged.

- [ ] **Step 1: Derive R2 creds locally**

```bash
source ~/Projects/beveradb/.envrc
KEY_ID=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["id"])')
SECRET=$(printf %s "$CLOUDFLARE_API_TOKEN" | shasum -a 256 | cut -d' ' -f1)
echo "$CLOUDFLARE_ACCOUNT_ID $KEY_ID $SECRET"
```

- [ ] **Step 2: Upload from the VM (datacenter bandwidth) - data/out FIRST, webdata/out SECOND**

Order matters: `webdata/out`'s extended `json/signature/*.json` must overwrite derive's base versions, so it uploads last. Never `rclone sync` - copy is additive.

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
         RCLONE_CONFIG_R2_ACCESS_KEY_ID=<KEY_ID> \
         RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<SECRET> \
         RCLONE_CONFIG_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com &&
  cd /opt/movie-word-analyzer/data/out &&
  rclone copy . r2:moviewords-data/ --checksum --transfers 16 --exclude report.md --exclude all/report.md --include \"*.json\" --header-upload \"Cache-Control: public, max-age=300\" &&
  rclone copy . r2:moviewords-data/ --checksum --transfers 16 --exclude report.md --exclude all/report.md --exclude \"*.json\" --header-upload \"Cache-Control: public, max-age=86400\" &&
  cd /opt/movie-word-analyzer/pipeline/webdata/out &&
  rclone copy . r2:moviewords-data/ --checksum --transfers 16 --include \"*.json\" --header-upload \"Cache-Control: public, max-age=300\" &&
  rclone copy . r2:moviewords-data/ --checksum --transfers 16 --exclude \"*.json\" --header-upload \"Cache-Control: public, max-age=86400\"
"'
```

(rclone `--include` and `--exclude` don't combine as filter chains in one command the way this reads - if rclone complains or uploads the wrong set, split into four commands using only `--include "*.json"` / `--exclude "*.json"` and handle report.md with `--filter "- report.md" --filter "- all/report.md"` flags instead. Verify with `rclone check` or a HEAD request afterward.)

- [ ] **Step 3: Purge the edge**

```bash
grep MOVIEWORDS_CF_TOKEN /Users/andrew/Projects/beveradb/moviewords/.envrc  # get token
curl -fsS -X POST -H "Authorization: Bearer <MOVIEWORDS_CF_TOKEN>" \
  -H "Content-Type: application/json" -d '{"purge_everything":true}' \
  "https://api.cloudflare.com/client/v4/zones/cac867b68baf009c1913495f2012353b/purge_cache"
```

Expected: `"success": true`.

- [ ] **Step 4: Spot-check the bucket**

```bash
curl -sI https://data.moviewords.org/all/movies.parquet | head -5
curl -s https://data.moviewords.org/all/json/leaderboard-default.json | head -c 200
curl -s https://data.moviewords.org/json/movies-index.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d), d[0].get("lang"))'
curl -s https://data.moviewords.org/all/json/movies-index.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d), sorted({m["lang"] for m in d})[:10])'
```

Expected: 200s; en index count ~26-28k with `lang == 'en'`; all index ~50k with many languages.

---

### Task 14: Deploy the app + prod verification

**Files:** none (operational, from the merged main checkout).

**Interfaces:**
- Consumes: merged main, published `all/` data (Task 13), Cloudflare creds in `/Users/andrew/Projects/beveradb/.envrc`.
- Produces: live moviewords.org with the toggle; verification evidence.

- [ ] **Step 1: Build and deploy (NEVER pipe the build - a masked tsc failure deploys stale dist)**

```bash
cd ~/Projects/beveradb/moviewords/app
npm run build
source ../.envrc
npx wrangler pages deploy dist --project-name moviewords --branch=main
```

- [ ] **Step 2: Fresh-profile browser verification (Playwright MCP; Chrome cache poisons range probes - always fresh profile)**

Checklist against https://moviewords.org:
1. Default load: header shows ENGLISH active; hero count matches the new en corpus size; network shows exactly 2 data requests (movies-index + featured-series.json), no wasm.
2. Click ALL FILMS: page reloads with `?c=all`; hero copy says "translated subtitles included"; count ~50k.
3. In all mode, search "Amélie" - result row shows a `translated · French` badge; movie page loads with the badge next to the genres.
4. Trends in all mode: chart renders; parquet requests are ranged 206s against `all/` paths.
5. Leaderboard, Decades, Genres, Compare all load in all mode (boards JSONs from `all/json/leaderboards/`).
6. Copy a URL with `?c=all#/movie/tt0211915`, open in another fresh profile: opens in the all corpus directly.
7. Toggle back to ENGLISH: `?c=` cleared, site behaves exactly as pre-change (plus more films).
8. Film superlatives board (Leaderboard → films tab): no sub-1000-vote film listed.

- [ ] **Step 3: Session record + memory**

Write the session record via `/wrap`; update the moviewords-status memory (corpus counts, all/ prefix, MIN_VOTES 300, VM ready for deletion pending Andrew's call - do NOT delete the VM yourself).

---

### Task 15: Mislabeled-subtitle blocklist in corpus_index

(Added 2026-09-14 after the tt0149624 investigation - see the spec addendum.)

**Files:**
- Create: `pipeline/src/moviewords_pipeline/mislabeled_subs.txt`
- Modify: `pipeline/src/moviewords_pipeline/corpus_index.py`
- Test: `pipeline/tests/test_corpus_index.py`

**Interfaces:**
- Produces: `load_blocklist() -> tuple[set[str], set[tuple[str, str]]]`
  (blocked imdb_ids, blocked (imdb_id, zip_name) pairs), applied inside
  `corpus_index.run()` before `select_best`. Data file format: full-line
  `#` comments; otherwise whitespace-separated `imdb_id [zip_name]`
  (anything after the second field is a comment); a bare `imdb_id` drops
  the whole film.

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/tests/test_corpus_index.py`:

```python
def test_load_blocklist_parses_ids_and_pairs(tmp_path, monkeypatch):
    from moviewords_pipeline import corpus_index
    bl = tmp_path / "mislabeled_subs.txt"
    bl.write_text(
        "# comment line\n"
        "\n"
        "tt0000001\n"
        "tt0149624 OpenSubtitles/raw/en/2000/149624/267165.xml LOTR sub\n"
    )
    monkeypatch.setattr(corpus_index, "BLOCKLIST_PATH", bl)
    ids, pairs = corpus_index.load_blocklist()
    assert ids == {"tt0000001"}
    assert pairs == {("tt0149624", "OpenSubtitles/raw/en/2000/149624/267165.xml")}


def test_blocklist_skips_file_and_film(tmp_path, monkeypatch):
    """A blocked zip_name falls through to the next-best candidate; a blocked
    imdb_id drops the film from the index entirely."""
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq
    import zipfile

    from moviewords_pipeline import config, corpus_index

    raw = tmp_path / "raw"; raw.mkdir()
    work = tmp_path / "work"; work.mkdir()
    monkeypatch.setattr(config, "RAW_DIR", raw)
    monkeypatch.setattr(config, "WORK_DIR", work)

    body = b'<?xml version="1.0" encoding="utf-8"?><document id="1">' \
           + b'<s id="1">hello there general kenobi today</s>' * 800 \
           + b"</document>"
    small = b'<?xml version="1.0" encoding="utf-8"?><document id="1">' \
            + b'<s id="1">hello there general kenobi today</s>' * 600 \
            + b"</document>"
    with zipfile.ZipFile(raw / "opus_en.zip", "w") as z:
        z.writestr("OpenSubtitles/raw/en/2000/1000001/9.xml", body)   # best
        z.writestr("OpenSubtitles/raw/en/2000/1000001/8.xml", small)  # runner-up
        z.writestr("OpenSubtitles/raw/en/2001/1000002/7.xml", body)

    table = pa.table({"imdb_id": pa.array(["tt1000001", "tt1000002"]),
                      "runtime_minutes": pa.array([90, 90])})
    con = duckdb.connect()
    con.sql("CREATE TABLE curated AS SELECT imdb_id, runtime_minutes FROM table")
    pq.write_table(
        pa.table({"imdb_id": ["tt1000001", "tt1000002"],
                  "runtime_minutes": [90, 90]}),
        str(work / "curated.parquet"))

    bl = tmp_path / "bl.txt"
    bl.write_text("tt1000002\n"
                  "tt1000001 OpenSubtitles/raw/en/2000/1000001/9.xml\n")
    monkeypatch.setattr(corpus_index, "BLOCKLIST_PATH", bl)

    corpus_index.run()
    rows = dict(duckdb.sql(
        f"SELECT imdb_id, zip_name FROM '{work / 'corpus_index.parquet'}'"
    ).fetchall())
    assert rows == {"tt1000001": "OpenSubtitles/raw/en/2000/1000001/8.xml"}
```

Note: the curated parquet only needs `imdb_id` and `runtime_minutes` (that's
all `corpus_index.run()` reads). Delete the stray `con`/`table` duckdb lines
above if pyarrow's `pq.write_table` alone suffices - it does; keep the test
minimal (the duckdb import is only for reading the output parquet).

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && uv run pytest tests/test_corpus_index.py -q`
Expected: FAIL - `AttributeError: ... no attribute 'BLOCKLIST_PATH'`.

- [ ] **Step 3: Create the seed blocklist file**

Create `pipeline/src/moviewords_pipeline/mislabeled_subs.txt`:

```
# Subtitle files mislabeled at OpenSubtitles upload time - see
# docs/sessions/2026-Q3/2026-09-14-mislabeled-subtitle-tt0149624.md and the
# dual-corpus spec addendum. Format: imdb_id [zip_name] [comment...]
# A bare imdb_id drops the film entirely; with a zip_name only that file is
# banned and select_best picks the next candidate.
tt0149624 OpenSubtitles/raw/en/2000/149624/267165.xml LOTR:FotR sub filed under All the Pretty Horses
```

- [ ] **Step 4: Implement in corpus_index.py**

Add after the `PATH_RE` definition:

```python
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
```

(add `from pathlib import Path` to the imports.)

In `run()`, apply it - change the zip scan loop to:

```python
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
```

- [ ] **Step 5: Run tests, full suite, commit**

Run: `uv run pytest tests/test_corpus_index.py -q` then `uv run pytest -q`
Expected: PASS (the seed blocklist entry changes nothing for the fixture corpus).

```bash
git add pipeline/src/moviewords_pipeline/mislabeled_subs.txt pipeline/src/moviewords_pipeline/corpus_index.py pipeline/tests/test_corpus_index.py
git commit -m "feat(pipeline): mislabeled-subtitle blocklist enforced at index time"
```

---

### Task 16: scan_mislabels.py detector

**Files:**
- Create: `pipeline/scripts/scan_mislabels.py`
- Test: `pipeline/tests/test_scan_mislabels.py`

**Interfaces:**
- Consumes: `work/word_counts.parquet`, `work/corpus_index.parquet`,
  `work/curated.parquet`, `raw/opus_en.zip`; `subtitle_parser.extract_text`,
  `wordcount.count_words`, `corpus_index.imdb_id_from_path`.
- Produces (importable): `cosine(a: dict, b: dict) -> float`;
  `find_suspect_pairs(con, min_shared=8) -> list[(id_a, id_b, shared)]`;
  `pick_victim(consensus_a: float, consensus_b: float) -> int | None`
  (0 or 1 = index of the mislabeled member, None = can't auto-decide).
  CLI: `uv run python scripts/scan_mislabels.py [--adjudicate] [--min-cosine 0.95]`.

- [ ] **Step 1: Write the failing tests**

Create `pipeline/tests/test_scan_mislabels.py`:

```python
import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401


def test_cosine_identical_and_disjoint():
    from scan_mislabels import cosine
    a = {"frodo": 10, "ring": 5}
    assert abs(cosine(a, a) - 1.0) < 1e-9
    assert cosine(a, {"horse": 3}) == 0.0
    assert cosine({}, a) == 0.0


def test_find_suspect_pairs_flags_shared_rare_words():
    from scan_mislabels import find_suspect_pairs
    con = duckdb.connect()
    con.sql("CREATE TABLE wc (imdb_id VARCHAR, word VARCHAR, count INT)")
    # tt1/tt2 share 10 rare words; tt3 is unrelated; 'the' is common to all
    rows = []
    for i, mid in enumerate(["tt1", "tt2", "tt3"]):
        rows.append((mid, "the", 1000))
        for j in range(10):
            word = f"rare{j}" if mid in ("tt1", "tt2") else f"other{j}"
            rows.append((mid, word, 50))
    con.executemany("INSERT INTO wc VALUES (?, ?, ?)", rows)
    pairs = find_suspect_pairs(con, min_shared=8)
    assert [(a, b) for a, b, _ in pairs] == [("tt1", "tt2")]


def test_pick_victim_prefers_low_directory_consensus():
    from scan_mislabels import pick_victim
    assert pick_victim(0.95, 0.10) == 1   # member B's dir disagrees with its chosen file
    assert pick_victim(0.10, 0.95) == 0
    assert pick_victim(0.95, 0.90) is None  # both self-consistent - manual review
    assert pick_victim(0.2, 0.3) is None    # both messy - manual review
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && uv run pytest tests/test_scan_mislabels.py -q`
Expected: FAIL - `ModuleNotFoundError: No module named 'scan_mislabels'`.

- [ ] **Step 3: Implement**

Create `pipeline/scripts/scan_mislabels.py`:

```python
"""Detect subtitle files published under the wrong IMDb id.

Stage 1: candidate pairs - films sharing >= min_shared of their top-30 RARE
words (document frequency 2-20). Character names and invented words are
rare; two films sharing many of them almost always share subtitle content.
Stage 2: cosine similarity on the full count vectors. >= 0.95 means the two
films published the same underlying subtitle - one id is wrong.
Stage 3 (--adjudicate): directory consensus. For each member of a duplicate
pair, count every OPUS candidate in its directory and measure how many agree
(cosine >= 0.8) with the file the pipeline chose. The mislabeled member is
the one whose own directory disagrees with its chosen file; the unanimous
directory is the true owner. Suggests blocklist lines for
moviewords_pipeline/mislabeled_subs.txt.

Run after the count stage:
  uv run python scripts/scan_mislabels.py [--adjudicate] [--min-cosine 0.95]
Known limitation: only catches duplicates where BOTH ids are in the corpus.
"""
import argparse
import math
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402

from moviewords_pipeline import config  # noqa: E402
from moviewords_pipeline.corpus_index import imdb_id_from_path  # noqa: E402
from moviewords_pipeline.subtitle_parser import extract_text  # noqa: E402
from moviewords_pipeline.wordcount import count_words  # noqa: E402


def cosine(a, b):
    if not a or not b:
        return 0.0
    dot = sum(c * b.get(w, 0) for w, c in a.items())
    na = math.sqrt(sum(c * c for c in a.values()))
    nb = math.sqrt(sum(c * c for c in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def find_suspect_pairs(con, min_shared=8):
    """Pairs of films sharing >= min_shared of their top-30 rare words.
    Expects a view/table `wc` with (imdb_id, word, count)."""
    con.sql("""
        CREATE OR REPLACE TEMP TABLE _top_rare AS
        SELECT imdb_id, word FROM (
            SELECT wc.imdb_id, wc.word,
                   ROW_NUMBER() OVER (PARTITION BY wc.imdb_id
                                      ORDER BY wc.count DESC) AS rn
            FROM wc
            JOIN (SELECT word, COUNT(DISTINCT imdb_id) AS films
                  FROM wc GROUP BY word) df USING (word)
            WHERE df.films BETWEEN 2 AND 20 AND wc.count >= 10
        ) WHERE rn <= 30
    """)
    return con.sql(f"""
        SELECT a.imdb_id, b.imdb_id, COUNT(*) AS shared
        FROM _top_rare a JOIN _top_rare b
          ON a.word = b.word AND a.imdb_id < b.imdb_id
        GROUP BY 1, 2 HAVING COUNT(*) >= {int(min_shared)}
        ORDER BY shared DESC
    """).fetchall()


def pick_victim(consensus_a, consensus_b):
    """Index (0/1) of the mislabeled pair member, or None if ambiguous.
    The victim's own directory disagrees with its chosen file (low
    consensus); the owner's directory is self-consistent (high)."""
    if consensus_a >= 0.8 and consensus_b < 0.5:
        return 1
    if consensus_b >= 0.8 and consensus_a < 0.5:
        return 0
    return None


def _vectors(con, ids):
    ph = ", ".join(f"'{i}'" for i in ids)
    vecs = defaultdict(dict)
    for imdb_id, word, count in con.sql(
            f"SELECT imdb_id, word, count FROM wc WHERE imdb_id IN ({ph})").fetchall():
        vecs[imdb_id][word] = count
    return vecs


def _directory_consensus(z, imdb_id, chosen_name, chosen_counts):
    """[(zip_name, tokens, cos_vs_chosen)] for every candidate in the film's
    OPUS dir, plus the fraction of OTHER candidates agreeing with the chosen
    file (empty dir of siblings -> 1.0, can't convict)."""
    rows, agree, others = [], 0, 0
    for info in z.infolist():
        if imdb_id_from_path(info.filename) != imdb_id:
            continue
        counts = count_words(extract_text(z.read(info.filename)))
        cos = cosine(counts, chosen_counts)
        rows.append((info.filename, sum(counts.values()), cos))
        if info.filename != chosen_name:
            others += 1
            agree += cos >= 0.8
    return rows, (agree / others if others else 1.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adjudicate", action="store_true")
    ap.add_argument("--min-cosine", type=float, default=0.95)
    ap.add_argument("--min-shared", type=int, default=8)
    args = ap.parse_args()

    w = config.WORK_DIR
    con = duckdb.connect()
    con.sql(f"CREATE VIEW wc AS SELECT * FROM '{w / 'word_counts.parquet'}'")
    titles = dict((r[0], f"{r[1]} ({r[2]})") for r in con.sql(
        f"SELECT imdb_id, title, year FROM '{w / 'curated.parquet'}'").fetchall())
    chosen = dict(con.sql(
        f"SELECT imdb_id, zip_name FROM '{w / 'corpus_index.parquet'}'").fetchall())

    pairs = find_suspect_pairs(con, args.min_shared)
    print(f"stage 1: {len(pairs)} candidate pairs (>= {args.min_shared} shared rare words)")
    ids = sorted({i for a, b, _ in pairs for i in (a, b)})
    vecs = _vectors(con, ids) if ids else {}

    duplicates, review = [], []
    for a, b, shared in pairs:
        cos = cosine(vecs[a], vecs[b])
        (duplicates if cos >= args.min_cosine else review).append((cos, shared, a, b))
    for label, bucket in (("DUPLICATE", duplicates), ("review", review)):
        for cos, shared, a, b in sorted(bucket, reverse=True):
            print(f"  {label:9s} cos={cos:.3f} shared={shared:2d} "
                  f"{a} {titles.get(a, '?')} | {b} {titles.get(b, '?')}")

    if not args.adjudicate or not duplicates:
        return
    print("\nstage 3: directory consensus for DUPLICATE pairs")
    with zipfile.ZipFile(config.RAW_DIR / "opus_en.zip") as z:
        for cos, shared, a, b in sorted(duplicates, reverse=True):
            cons = {}
            for m in (a, b):
                rows, consensus = _directory_consensus(z, m, chosen[m], vecs[m])
                cons[m] = consensus
                print(f"\n  {m} {titles.get(m, '?')} chosen={chosen[m]} "
                      f"sibling-consensus={consensus:.2f}")
                for name, tokens, c in sorted(rows, key=lambda r: -r[2]):
                    marker = "*" if name == chosen[m] else " "
                    print(f"   {marker} cos={c:.3f} {tokens:6d}t {name}")
            victim = pick_victim(cons[a], cons[b])
            if victim is None:
                print(f"  VERDICT: manual review - consensus {cons[a]:.2f} vs {cons[b]:.2f}")
            else:
                vid = (a, b)[victim]
                print(f"  VERDICT: {vid} is mislabeled - suggested blocklist line:")
                print(f"    {vid} {chosen[vid]} content matches {(a, b)[1 - victim]}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests, full suite, commit**

Run: `uv run pytest tests/test_scan_mislabels.py -q` then `uv run pytest -q`
Expected: PASS.

```bash
git add pipeline/scripts/scan_mislabels.py pipeline/tests/test_scan_mislabels.py
git commit -m "feat(pipeline): two-stage mislabeled-subtitle scanner with directory-consensus adjudication"
```

---

### Task 12 runbook addendum (mislabel scan)

Between Task 12 Step 3 (enrich) and Step 4 (derive), insert:

- [ ] **Step 3b: scan for mislabeled subtitles and populate the blocklist**

```bash
gcloud compute ssh moviewords-pipeline-tmp --project=nomadkaraoke --zone=us-central1-a --command='sudo bash -c "
  cd /opt/movie-word-analyzer/pipeline &&
  /root/.local/bin/uv run python scripts/scan_mislabels.py --adjudicate
"' | tee /tmp/mislabel-report.txt
```

Adjudicate: for each DUPLICATE verdict, add the suggested line to
`pipeline/src/moviewords_pipeline/mislabeled_subs.txt` on the branch (the
tt0149624 LOTR file is pre-seeded); `manual review` verdicts get a human
decision using the printed per-file tables + film knowledge. Gray-zone
`review` pairs (cosine 0.75-0.95) are only blocked if their tables show a
clear foreign match. Commit the blocklist update, push, `git pull` on the VM,
then re-run:

```bash
uv run python -m moviewords_pipeline.cli index
uv run python -m moviewords_pipeline.cli count   # re-counts only re-selected films
```

and continue with Step 4 (derive).

---

## Plan self-review notes

- Spec coverage: corpus definitions (T2), threshold (T1), data layout (T2/T12/T13), word_year_lang + original_language (T2/T4), superlatives floor (T5), rebuild/fetch corpus args (T6), registry/state/toggle (T7-T9), badges + copy (T10-T11), execution/upload/deploy/verify (T12-T14). Gap check: movies-index heredoc replacement (T4) ✓; posters union (T12 step 6) ✓.
- Known judgment calls the implementer may hit: rclone filter-flag combination in T13 (fallback given inline); `fetch_posters.py` id source in T12 step 6 (read the script, adapt); Task 11's corpus counts get finalized from the T12 reports.
