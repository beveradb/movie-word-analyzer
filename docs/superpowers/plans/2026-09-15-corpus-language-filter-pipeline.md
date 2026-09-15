# Corpus Language Filter — Pipeline Bake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce per-language data slices (`all/lang/<code>/…`) plus a
`languages.json` manifest, so the frontend can filter every feature by a film's
original language.

**Architecture:** Reuse the existing `rebuild_web_data.py` stages verbatim by
first building a *language-scoped input tree* (filtered `movies`,
`words_by_movie`, a `word_year` re-derived from `word_year_lang`, and a
recomputed signature base), then pointing the stages at that subtree. One new
orchestration script bakes one language; a driver loops the 34 options. Chinese
(`cn`+`zh`) is the one two-code slice.

**Tech Stack:** Python 3.12, DuckDB, pytest, `uv`. Data on Cloudflare R2 at
`data.moviewords.org` under the `all/` prefix.

## Global Constraints

- Languages offered: the **35 original languages with ≥100 films**, presented as
  **34 options** — `cn`+`zh` merge into one "Chinese" slice keyed `zh`, built
  from `original_language IN ('zh','cn')`.
- Per-language outputs live under **`all/lang/<code>/`** mirroring the bucket.
- **Aggregates only** get per-language copies: `word_meta.parquet`,
  `json/leaderboard-default.json`, `json/leaderboards/{shifts,films,wonders,everywhere}.json`,
  `json/signature/{decades,genres}.json`, `json/featured-series.json`,
  `json/trend/<key>.json`, `json/year-totals.json`. **Not** per-language:
  `json/movie/<id>.json`, `json/movies-index.json`, `json/wordlists.json`.
- Trend object key/filename is the **raw word** (`don't.json`) — the edge
  percent-decodes the path once before key lookup. (Existing `_word_key`.)
- Bake runs on already-published `all/` parquets — no VM, no raw subtitles.
- Commit frequently. Run tests with `cd pipeline && uv run pytest`.

---

## File Structure

- **Modify** `pipeline/src/moviewords_pipeline/derive.py` — extract a reusable
  `build_signature_base(con) -> dict[str, dict]` from `_write_signatures`.
- **Create** `pipeline/scripts/build_lang_slice.py` — build one language's scoped
  input tree from the published `all/` parquets.
- **Modify** `pipeline/scripts/rebuild_web_data.py` — teach `set_corpus` a
  `lang` subtree so stages read/write `all/lang/<code>/`.
- **Create** `pipeline/scripts/build_languages_manifest.py` — emit
  `all/json/languages.json`.
- **Create** `pipeline/scripts/bake_all_languages.py` — driver: for each of the
  34 options, run `build_lang_slice` then the rebuild stages.
- **Create** tests: `pipeline/tests/test_build_lang_slice.py`,
  `pipeline/tests/test_languages_manifest.py`; extend
  `pipeline/tests/test_derive.py`.

---

## Task 1: Extract a reusable signature-base builder from derive.py

**Files:**
- Modify: `pipeline/src/moviewords_pipeline/derive.py:136-187` (`_write_signatures`)
- Test: `pipeline/tests/test_derive.py`

**Interfaces:**
- Produces: `build_signature_base(con) -> dict[str, dict]` returning
  `{"decades": {...}, "genres": {...}}` where each value is
  `{ "<key>": {"movie_count": int, "total_words": int, "top": [[w,c],…],
  "signature": [[w,z],…]} }`. Requires the connection to have `movies` and `wc`
  views (as `_write_signatures` already assumes).

- [ ] **Step 1: Write the failing test**

Add to `pipeline/tests/test_derive.py`:

```python
def test_build_signature_base_returns_decades_and_genres():
    import duckdb
    from moviewords_pipeline.derive import build_signature_base
    con = duckdb.connect()
    con.sql("""
        CREATE TABLE movies AS SELECT * FROM (VALUES
            ('tt1','A',1994, ['Crime']),
            ('tt2','B',1995, ['Crime','Drama'])
        ) t(imdb_id,title,year,genres);
        CREATE TABLE wc AS SELECT * FROM (VALUES
            ('tt1','heist',30),('tt1','gun',20),
            ('tt2','heist',10),('tt2','love',25)
        ) t(imdb_id,word,count);
    """)
    base = build_signature_base(con)
    assert set(base) == {"decades", "genres"}
    assert "1990" in base["decades"]
    assert "Crime" in base["genres"]
    entry = base["decades"]["1990"]
    assert entry["movie_count"] == 2
    assert entry["total_words"] > 0
    assert isinstance(entry["top"], list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_derive.py::test_build_signature_base_returns_decades_and_genres -v`
Expected: FAIL — `ImportError: cannot import name 'build_signature_base'`.

- [ ] **Step 3: Refactor `_write_signatures` to delegate to the new builder**

In `pipeline/src/moviewords_pipeline/derive.py`, replace the body of
`_write_signatures` so the per-entity computation lives in a returnable
function. Keep all existing logic (the `min_films`, `log_odds`, stop-word
filtering) intact — only move it:

```python
def build_signature_base(con) -> dict:
    """Compute the decade/genre log-odds signature payloads from the `movies`
    and `wc` views. Returned as {kind: {key: entry}} so callers can write it to
    a per-corpus or per-language signature/*.json base."""
    stop = load_stopwords()
    corpus = dict(con.sql(
        "SELECT word, SUM(count) FROM wc JOIN movies USING (imdb_id) GROUP BY word"
    ).fetchall())
    n_corpus = sum(corpus.values())
    kinds = {
        "decades": ("(m.year // 10) * 10",
                    "SELECT DISTINCT (year // 10) * 10 FROM movies ORDER BY 1"),
        "genres": ("g.genre",
                   "SELECT DISTINCT UNNEST(genres) FROM movies ORDER BY 1"),
    }
    out = {}
    for kind, (key_expr, keys_sql) in kinds.items():
        genre_join = ("JOIN (SELECT imdb_id, UNNEST(genres) AS genre FROM movies) g "
                      "USING (imdb_id)") if kind == "genres" else ""
        payload = {}
        for (key,) in con.sql(keys_sql).fetchall():
            if key is None:
                continue
            n_movies = con.sql(f"""
                SELECT COUNT(DISTINCT m.imdb_id) FROM movies m {genre_join}
                WHERE {key_expr} = ?
            """, params=[key]).fetchone()[0]
            min_films = min(3, n_movies)
            rows = con.sql(f"""
                SELECT wc.word, SUM(wc.count)::BIGINT AS c
                FROM wc JOIN movies m USING (imdb_id) {genre_join}
                WHERE {key_expr} = ? GROUP BY wc.word
                HAVING COUNT(DISTINCT wc.imdb_id) >= {min_films}
                ORDER BY c DESC
            """, params=[key]).fetchall()
            counts = dict(rows)
            payload[str(key)] = {
                "movie_count": n_movies,
                "total_words": sum(counts.values()),
                "top": [[w, c] for w, c in rows if w not in stop][:100],
                "signature": [[w, round(z, 2)]
                              for w, z in log_odds(counts, corpus, min_count=20,
                                                   n_corpus=n_corpus)[:100]],
            }
        out[kind] = payload
    return out


def _write_signatures(con, out):
    """Signature (log-odds) and top words for whole decades and genres, one
    small JSON per entity kind (see build_signature_base)."""
    base = build_signature_base(con)
    (out / "json" / "signature").mkdir(parents=True, exist_ok=True)
    for kind, payload in base.items():
        (out / "json" / "signature" / f"{kind}.json").write_text(json.dumps(payload))
```

- [ ] **Step 4: Run the new test and the existing derive/e2e tests**

Run: `cd pipeline && uv run pytest tests/test_derive.py tests/test_e2e.py tests/test_signatures_ext.py -v`
Expected: PASS (new test passes; the existing signature artifacts are byte-identical).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/moviewords_pipeline/derive.py pipeline/tests/test_derive.py
git commit -m "refactor(pipeline): extract build_signature_base for reuse by per-language bake"
```

---

## Task 2: Language-scoped input builder

**Files:**
- Create: `pipeline/scripts/build_lang_slice.py`
- Test: `pipeline/tests/test_build_lang_slice.py`

**Interfaces:**
- Consumes: `build_signature_base` (Task 1).
- Produces: `build_slice(all_in: Path, out_in: Path, codes: list[str]) -> int`.
  Reads the published `all/` input parquets under `all_in`
  (`movies.parquet`, `words_by_movie/data.parquet`, `word_year_lang.parquet`)
  and writes a scoped input tree under `out_in`: `movies.parquet`,
  `words_by_movie.parquet`, `word_year.parquet`, and
  `signature/{decades,genres}.json`. Returns the film count.
- `CODES: dict[str, list[str]]` maps an option code to its source language
  codes; only `{"zh": ["zh", "cn"]}` is multi-code, all others map to `[code]`.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/test_build_lang_slice.py`:

```python
import json
from pathlib import Path

import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401


def _make_all_inputs(root: Path):
    """Two es films, one en film, plus word_year_lang covering them."""
    (root / "words_by_movie").mkdir(parents=True)
    con = duckdb.connect()
    con.sql(f"""
        COPY (SELECT * FROM (VALUES
            ('tt_es1','Amores',2000,['Drama'],'es',1000),
            ('tt_es2','Mar',2004,['Drama'],'es',1200),
            ('tt_en1','Heat',1995,['Crime'],'en',9000)
        ) t(imdb_id,title,year,genres,original_language,total_words))
        TO '{root}/movies.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES
            ('tt_es1','amor',40),('tt_es2','amor',60),('tt_en1','gun',50)
        ) t(imdb_id,word,count))
        TO '{root}/words_by_movie/data.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES
            ('amor',2000,'es',40,1),('amor',2004,'es',60,1),('gun',1995,'en',50,1)
        ) t(word,year,lang,count,movie_count))
        TO '{root}/word_year_lang.parquet' (FORMAT parquet);
    """)


def test_build_slice_filters_to_language(tmp_path):
    from build_lang_slice import build_slice
    all_in = tmp_path / "all"
    _make_all_inputs(all_in)
    out_in = tmp_path / "lang" / "es"
    n = build_slice(all_in, out_in, ["es"])
    assert n == 2

    movies = duckdb.sql(f"SELECT imdb_id, original_language FROM '{out_in}/movies.parquet'").fetchall()
    assert {m[0] for m in movies} == {"tt_es1", "tt_es2"}
    assert {m[1] for m in movies} == {"es"}

    wbm = duckdb.sql(f"SELECT DISTINCT imdb_id FROM '{out_in}/words_by_movie.parquet'").fetchall()
    assert {r[0] for r in wbm} == {"tt_es1", "tt_es2"}

    wy = duckdb.sql(f"SELECT word, year, count FROM '{out_in}/word_year.parquet' ORDER BY year").fetchall()
    assert wy == [("amor", 2000, 40), ("amor", 2004, 60)]

    sig = json.loads((out_in / "signature" / "decades.json").read_text())
    assert "2000" in sig  # both es films are in the 2000s decade


def test_chinese_merges_two_codes(tmp_path):
    from build_lang_slice import build_slice, CODES
    assert CODES["zh"] == ["zh", "cn"]
    all_in = tmp_path / "all"
    (all_in / "words_by_movie").mkdir(parents=True)
    con = duckdb.connect()
    con.sql(f"""
        COPY (SELECT * FROM (VALUES
            ('tt_zh','Hero',2002,['Action'],'zh',3000),
            ('tt_cn','IP',2008,['Action'],'cn',3200)
        ) t(imdb_id,title,year,genres,original_language,total_words))
        TO '{all_in}/movies.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES ('tt_zh','fight',20),('tt_cn','fight',22)) t(imdb_id,word,count))
        TO '{all_in}/words_by_movie/data.parquet' (FORMAT parquet);
        COPY (SELECT * FROM (VALUES ('fight',2002,'zh',20,1),('fight',2008,'cn',22,1)) t(word,year,lang,count,movie_count))
        TO '{all_in}/word_year_lang.parquet' (FORMAT parquet);
    """)
    n = build_slice(all_in, tmp_path / "lang" / "zh", CODES["zh"])
    assert n == 2
    wy = duckdb.sql(f"SELECT word, SUM(count) FROM '{tmp_path}/lang/zh/word_year.parquet' GROUP BY word").fetchall()
    assert wy == [("fight", 42)]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_build_lang_slice.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_lang_slice'`.

- [ ] **Step 3: Write `build_lang_slice.py`**

Create `pipeline/scripts/build_lang_slice.py`:

```python
"""Build one language's scoped input tree from the published all/ parquets, so
the existing rebuild_web_data stages can bake per-language aggregates. See
docs/superpowers/specs/2026-09-14-corpus-language-filter-design.md.

  uv run python scripts/build_lang_slice.py --lang es
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402

from moviewords_pipeline.derive import build_signature_base  # noqa: E402

# The only option built from two TMDB codes; every other option is single-code.
CODES = {"zh": ["zh", "cn"]}


def build_slice(all_in: Path, out_in: Path, codes: list[str]) -> int:
    (out_in / "words_by_movie").mkdir(parents=True, exist_ok=True)
    (out_in / "signature").mkdir(parents=True, exist_ok=True)
    in_list = ", ".join(f"'{c}'" for c in codes)
    con = duckdb.connect()
    con.sql(f"""
        CREATE TABLE movies AS
            SELECT * FROM '{all_in}/movies.parquet'
            WHERE original_language IN ({in_list});
        CREATE TABLE wc AS
            SELECT w.* FROM '{all_in}/words_by_movie/data.parquet' w
            WHERE w.imdb_id IN (SELECT imdb_id FROM movies);
    """)
    con.sql(f"COPY movies TO '{out_in}/movies.parquet' (FORMAT parquet)")
    con.sql(f"""
        COPY (SELECT * FROM wc ORDER BY imdb_id, count DESC)
        TO '{out_in}/words_by_movie.parquet' (FORMAT parquet)
    """)
    # word_year re-derived from the per-language word_year_lang: sum the selected
    # codes per (word, year), then re-apply the same per-word >=20 corpus floor
    # word_year.parquet uses so trend eligibility matches the whole-corpus rule.
    con.sql(f"""
        COPY (
            SELECT word, year, SUM(count)::BIGINT AS count,
                   SUM(movie_count)::BIGINT AS movie_count
            FROM '{all_in}/word_year_lang.parquet'
            WHERE lang IN ({in_list})
            GROUP BY word, year
            QUALIFY SUM(SUM(count)) OVER (PARTITION BY word) >= 20
            ORDER BY word, year
        ) TO '{out_in}/word_year.parquet' (FORMAT parquet)
    """)
    base = build_signature_base(con)
    for kind, payload in base.items():
        (out_in / "signature" / f"{kind}.json").write_text(json.dumps(payload))
    return con.sql("SELECT COUNT(*) FROM movies").fetchone()[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", required=True)
    ap.add_argument("--webdata", default=str(Path(__file__).resolve().parent.parent / "webdata"))
    args = ap.parse_args()
    root = Path(args.webdata)
    codes = CODES.get(args.lang, [args.lang])
    n = build_slice(root / "in" / "all", root / "in" / "all" / "lang" / args.lang, codes)
    print(f"wrote {n} films for lang {args.lang} ({'+'.join(codes)})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_build_lang_slice.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/scripts/build_lang_slice.py pipeline/tests/test_build_lang_slice.py
git commit -m "feat(pipeline): language-scoped input builder (movies/wc/word_year/signature)"
```

---

## Task 3: Teach rebuild_web_data a language subtree

**Files:**
- Modify: `pipeline/scripts/rebuild_web_data.py:38-45` (`set_corpus`)
- Test: `pipeline/tests/test_stage_trends.py` (add a subtree test)

**Interfaces:**
- Produces: `set_corpus(corpus, lang=None)` — when `lang` is given, `IN`/`OUT`
  point at `all/lang/<lang>/`. CLI gains `--lang`.

- [ ] **Step 1: Write the failing test**

Add to `pipeline/tests/test_stage_trends.py`:

```python
def test_set_corpus_lang_points_at_lang_subtree():
    import rebuild_web_data as rwd
    rwd.set_corpus("all", lang="es")
    assert rwd.IN.parts[-3:] == ("all", "lang", "es")
    assert rwd.OUT.parts[-3:] == ("all", "lang", "es")
    rwd.set_corpus("en")  # reset for other tests
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_stage_trends.py::test_set_corpus_lang_points_at_lang_subtree -v`
Expected: FAIL — `set_corpus() got an unexpected keyword argument 'lang'`.

- [ ] **Step 3: Extend `set_corpus` and the CLI**

In `pipeline/scripts/rebuild_web_data.py`, replace `set_corpus`:

```python
def set_corpus(corpus, lang=None):
    """Point IN/OUT at the corpus subtree. 'en' keeps the historical flat
    layout; 'all' nests under all/; a lang nests under all/lang/<code>/
    mirroring the bucket prefix."""
    global IN, OUT
    sub = () if corpus == "en" else ("all",)
    if lang:
        sub = ("all", "lang", lang)
    IN = ROOT.joinpath("in", *sub)
    OUT = ROOT.joinpath("out", *sub)
```

And in `main()`, add the flag and pass it through:

```python
    ap.add_argument("--lang", default=None)
    ...
    set_corpus(args.corpus, lang=args.lang)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd pipeline && uv run pytest tests/test_stage_trends.py -v`
Expected: PASS (new subtree test + existing stage_trends test).

- [ ] **Step 5: Commit**

```bash
git add pipeline/scripts/rebuild_web_data.py pipeline/tests/test_stage_trends.py
git commit -m "feat(pipeline): rebuild_web_data --lang points stages at all/lang/<code>/"
```

---

## Task 4: Languages manifest

**Files:**
- Create: `pipeline/scripts/build_languages_manifest.py`
- Test: `pipeline/tests/test_languages_manifest.py`

**Interfaces:**
- Produces: `build(movies_parquet: Path, dest: Path, min_films: int = 100) ->
  list[dict]` writing `[{"code": str, "films": int}, …]` sorted by `films`
  descending, `cn`+`zh` merged to `zh`, only options with `films >= min_films`.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/test_languages_manifest.py`:

```python
import json
from pathlib import Path

import duckdb

from scripts_path import add_scripts_to_path  # noqa: F401


def test_manifest_merges_chinese_and_applies_floor(tmp_path):
    from build_languages_manifest import build
    p = tmp_path / "movies.parquet"
    con = duckdb.connect()
    # es: 3, zh: 2, cn: 2 (=> Chinese 4), fr: 1 (below floor of 2)
    con.sql(f"""
        COPY (SELECT * FROM (VALUES
            ('a','es'),('b','es'),('c','es'),
            ('d','zh'),('e','zh'),('f','cn'),('g','cn'),
            ('h','fr')
        ) t(imdb_id, original_language))
        TO '{p}' (FORMAT parquet)
    """)
    dest = tmp_path / "languages.json"
    opts = build(p, dest, min_films=2)
    assert {o["code"] for o in opts} == {"es", "zh"}   # fr dropped, cn folded into zh
    by = {o["code"]: o["films"] for o in opts}
    assert by == {"zh": 4, "es": 3}
    assert opts[0]["code"] == "zh"  # sorted by films desc
    assert json.loads(dest.read_text()) == opts
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_languages_manifest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_languages_manifest'`.

- [ ] **Step 3: Write `build_languages_manifest.py`**

Create `pipeline/scripts/build_languages_manifest.py`:

```python
"""Emit all/json/languages.json - the corpus-filter manifest: the languages
with >= MIN_FILMS films (cn+zh merged into zh), sorted by film count.

  uv run python scripts/build_languages_manifest.py
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import duckdb  # noqa: E402

from moviewords_pipeline import config  # noqa: E402

MIN_FILMS = 100
MERGE = {"cn": "zh"}  # TMDB splits Chinese; fold cn into zh


def build(movies_parquet: Path, dest: Path, min_films: int = MIN_FILMS) -> list[dict]:
    rows = duckdb.sql(
        f"SELECT original_language AS lang, COUNT(*) AS n FROM '{movies_parquet}' GROUP BY 1"
    ).fetchall()
    counts: dict[str, int] = {}
    for lang, n in rows:
        if lang is None:
            continue
        code = MERGE.get(lang, lang)
        counts[code] = counts.get(code, 0) + n
    opts = [{"code": c, "films": n} for c, n in counts.items() if n >= min_films]
    opts.sort(key=lambda o: (-o["films"], o["code"]))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(opts))
    return opts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--webdata", default=str(Path(__file__).resolve().parent.parent / "webdata"))
    args = ap.parse_args()
    root = Path(args.webdata)
    opts = build(root / "in" / "all" / "movies.parquet",
                 root / "out" / "all" / "json" / "languages.json")
    print(f"wrote {len(opts)} language options")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_languages_manifest.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/scripts/build_languages_manifest.py pipeline/tests/test_languages_manifest.py
git commit -m "feat(pipeline): languages.json manifest (>=100 films, cn+zh merged)"
```

---

## Task 5: Driver — bake all 34 language options

**Files:**
- Create: `pipeline/scripts/bake_all_languages.py`
- Test: `pipeline/tests/test_bake_all_languages.py`

**Interfaces:**
- Consumes: `build_lang_slice.build_slice`/`CODES` (Task 2), `rebuild_web_data`
  stages (Task 3), `build_languages_manifest.build` (Task 4).
- Produces: `option_codes(manifest: list[dict]) -> list[str]` and a `main()`
  that, for each option, builds the slice then runs the rebuild stages for
  `all/lang/<code>/`, and finally emits the manifest.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/test_bake_all_languages.py`:

```python
from scripts_path import add_scripts_to_path  # noqa: F401


def test_option_codes_reads_manifest_order():
    from bake_all_languages import option_codes
    manifest = [{"code": "fr", "films": 3696}, {"code": "zh", "films": 1743}]
    assert option_codes(manifest) == ["fr", "zh"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_bake_all_languages.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'bake_all_languages'`.

- [ ] **Step 3: Write `bake_all_languages.py`**

Create `pipeline/scripts/bake_all_languages.py`:

```python
"""Bake every per-language slice under webdata/out/all/lang/<code>/, then write
the languages.json manifest. Assumes the published all/ inputs are already
mirrored under webdata/in/all/ (scripts/fetch_published.sh all).

  uv run python scripts/bake_all_languages.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import build_lang_slice as slice_mod  # noqa: E402
import build_languages_manifest as manifest_mod  # noqa: E402
import rebuild_web_data as rwd  # noqa: E402

WEBDATA = Path(__file__).resolve().parent.parent / "webdata"


def option_codes(manifest: list[dict]) -> list[str]:
    return [o["code"] for o in manifest]


def main():
    all_in = WEBDATA / "in" / "all"
    manifest = manifest_mod.build(
        all_in / "movies.parquet",
        WEBDATA / "out" / "all" / "json" / "languages.json")
    codes = option_codes(manifest)
    print(f"baking {len(codes)} languages: {', '.join(codes)}")
    for code in codes:
        t0 = time.time()
        src_codes = slice_mod.CODES.get(code, [code])
        n = slice_mod.build_slice(all_in, all_in / "lang" / code, src_codes)
        rwd.set_corpus("all", lang=code)
        rwd.OUT.mkdir(parents=True, exist_ok=True)
        for name in rwd.STAGES:
            rwd.STAGES[name](rwd.connect())
        print(f"  {code}: {n} films, baked in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_bake_all_languages.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/scripts/bake_all_languages.py pipeline/tests/test_bake_all_languages.py
git commit -m "feat(pipeline): driver to bake all 34 language slices + manifest"
```

---

## Task 6: End-to-end slice bake on a fixture, then publish

**Files:**
- Test: `pipeline/tests/test_build_lang_slice.py` (add an end-to-end assertion)
- Modify (if needed): `pipeline/scripts/upload_r2.sh`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing end-to-end test**

Add to `pipeline/tests/test_build_lang_slice.py` (reuses `_make_all_inputs`):

```python
def test_slice_then_rebuild_stage_trends(tmp_path, monkeypatch):
    import rebuild_web_data as rwd
    from build_lang_slice import build_slice
    all_in = tmp_path / "in" / "all"
    _make_all_inputs(all_in)
    build_slice(all_in, all_in / "lang" / "es", ["es"])

    monkeypatch.setattr(rwd, "ROOT", tmp_path)
    rwd.set_corpus("all", lang="es")
    rwd.OUT.mkdir(parents=True, exist_ok=True)
    rwd.stage_trends(rwd.connect())

    import json
    amor = json.loads((rwd.OUT / "json" / "trend" / "amor.json").read_text())
    assert amor["line"] == [[2000, 40], [2004, 60]]
    # the en-only 'gun' word is absent from the es slice
    assert not (rwd.OUT / "json" / "trend" / "gun.json").exists()
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `cd pipeline && uv run pytest tests/test_build_lang_slice.py::test_slice_then_rebuild_stage_trends -v`
Expected: initially FAIL if `ROOT`/`set_corpus` wiring is off; fix by ensuring
`set_corpus` recomputes `IN`/`OUT` from the monkeypatched `ROOT` (it does, since
it reads the module global `ROOT` at call time — call `set_corpus` AFTER the
monkeypatch, as the test does). Expected after: PASS.

- [ ] **Step 3: Confirm upload covers the new paths**

Read `pipeline/scripts/upload_r2.sh`. The per-language outputs live under
`webdata/out/all/lang/…` and `webdata/out/all/json/languages.json`. Verify the
script's source path is `webdata/out` (recursive/additive) so `all/lang/**` and
`languages.json` are included with the same Cache-Control. If the script hard-codes
narrower paths, add `all/lang` and `all/json/languages.json` to its copy set.
(No code shown here because the fix depends on the script's current shape — make
the minimal change so the new objects are uploaded with Cache-Control set.)

- [ ] **Step 4: Full pipeline test suite**

Run: `cd pipeline && uv run pytest -q`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add pipeline/tests/test_build_lang_slice.py pipeline/scripts/upload_r2.sh
git commit -m "test(pipeline): e2e slice->rebuild trend bake; ensure upload covers all/lang"
```

---

## Manual bake & publish (run once after the code lands)

Not a test step — the real data run:

```bash
cd pipeline
scripts/fetch_published.sh all                      # mirror all/ inputs locally
uv run python scripts/bake_all_languages.py          # bake 34 slices + manifest
# spot-check one language:
python -c "import json,glob; print(len(glob.glob('webdata/out/all/lang/es/json/trend/*.json')))"
scripts/upload_r2.sh                                 # publish + Cache-Control + edge purge
# verify live:
curl -s https://data.moviewords.org/all/json/languages.json | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' https://data.moviewords.org/all/lang/es/json/leaderboard-default.json
```

---

## Self-Review

**Spec coverage:** per-language aggregate bake (Tasks 2/3/5), Chinese merge
(Tasks 2/4), manifest with counts (Task 4), signature base per language
(Tasks 1/2), movie-index stays global with `lang` (already present — no task
needed), reused rebuild stages (Task 3/5), publish path (Task 6). Frontend
merge/dropdown/degradation/locale are the **separate Plan 2** (not in scope
here). Migration/retirement of the root `en` bake is deferred to Plan 2's
cutover (English maps to `all/lang/en/` there).

**Placeholders:** Task 6 Step 3 intentionally defers exact `upload_r2.sh` edits
to the script's actual shape — flagged, not a hidden TODO; the acceptance
criterion (new objects uploaded with Cache-Control) is explicit.

**Type consistency:** `build_slice(all_in, out_in, codes)`, `CODES`,
`build_signature_base(con)`, `build(movies_parquet, dest, min_films)`,
`set_corpus(corpus, lang)`, `option_codes(manifest)` are used consistently
across tasks.
