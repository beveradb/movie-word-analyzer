# Movie page details + include/exclude filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TMDB-sourced movie details (blurb, runtime, words/min), link the poster and IMDb rating to IMDb, and make the word-type chips rotate off → include → exclude → off — with a minimal, no-VM TMDB metadata fetch that archives thorough per-film metadata for future use.

**Architecture:** A standalone pipeline script fetches one TMDB detail call per film (`append_to_response=credits,keywords`) and writes three tiers: a raw per-film cache (future-proof), a consolidated `tmdb_meta.parquet` (analysis-ready), and a tiny per-film `json/blurb/{id}.json` sidecar the app reads. The React movie page fetches the sidecar lazily (404-tolerant), renders a blurb block + new stats, and links poster/rating to IMDb. The POS filter state becomes a tri-state `Map`.

**Tech Stack:** Python 3 + duckdb + requests + pytest (pipeline); React + TypeScript + Vite + Vitest (app); rclone (publish).

## Global Constraints

- **No GCP VM, no recompute.** Only new, additive data work: fetch TMDB metadata and write new files. The heavy corpus pipeline must not re-run.
- **Copy style:** use `" - "` (spaced hyphen), never em-dashes; en-dash only for year ranges.
- **Vite dev server must run on port 5173** (bucket CORS depends on it).
- **Frontend degrades gracefully** with no blurb files present — the movie page must render fine when `json/blurb/{id}.json` is missing (404).
- **Pipeline scripts** live in `pipeline/scripts/`, import via `sys.path.insert(0, .../src)`, reuse `moviewords_pipeline.tmdb.make_session`/`BASE` and `moviewords_pipeline.config`, and are **resumable** (skip existing files, never let one film kill the batch).
- Data is served from the global tree: `globalUrl(p)` → `${DATA_BASE}/all/${p}`. Blurbs are global (keyed by imdb_id), never per-language.
- Run app tests with `cd app && npm run test`; pipeline tests with `cd pipeline && uv run pytest`.

---

### Task 1: Pipeline — pure record shaping (`parse_record`, `blurb_of`)

Pure functions that turn a raw TMDB detail+credits+keywords payload into (a) a flat analysis record for the parquet and (b) the minimal sidecar blurb. No network — fully unit-testable.

**Files:**
- Create: `pipeline/src/moviewords_pipeline/tmdb_meta.py`
- Test: `pipeline/tests/test_tmdb_meta.py`

**Interfaces:**
- Produces: `parse_record(raw: dict, imdb_id: str) -> dict` — flat record with the tier-2 columns.
- Produces: `blurb_of(record: dict) -> dict` — `{overview?, tagline?, runtime?}` with empty/falsy values omitted.

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_tmdb_meta.py
from moviewords_pipeline.tmdb_meta import blurb_of, parse_record

RAW = {
    "id": 550,
    "original_title": "Fight Club",
    "overview": "A ticking-time-bomb insomniac...",
    "tagline": "Mischief. Mayhem. Soap.",
    "runtime": 139,
    "release_date": "1999-10-15",
    "status": "Released",
    "homepage": "",
    "adult": False,
    "belongs_to_collection": {"id": 9, "name": "Fight Club Collection"},
    "budget": 63000000,
    "revenue": 100853753,
    "popularity": 61.4,
    "vote_average": 8.4,
    "vote_count": 27000,
    "genres": [{"id": 18, "name": "Drama"}],
    "spoken_languages": [{"english_name": "English", "name": "English"}],
    "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
    "production_companies": [{"id": 1, "name": "Fox 2000 Pictures"}],
    "keywords": {"keywords": [{"id": 1, "name": "dual identity"}, {"id": 2, "name": "nihilism"}]},
    "credits": {
        "cast": [
            {"name": "Edward Norton", "character": "The Narrator", "order": 0},
            {"name": "Brad Pitt", "character": "Tyler Durden", "order": 1},
        ],
        "crew": [
            {"name": "David Fincher", "job": "Director", "department": "Directing"},
            {"name": "Jim Uhls", "job": "Screenplay", "department": "Writing"},
            {"name": "Chuck Palahniuk", "job": "Novel", "department": "Writing"},
            {"name": "Dust Brothers", "job": "Original Music Composer", "department": "Sound"},
            {"name": "Jeff Cronenweth", "job": "Director of Photography", "department": "Camera"},
            {"name": "Art Linson", "job": "Producer", "department": "Production"},
        ],
    },
}


def test_parse_record_flattens_key_fields():
    r = parse_record(RAW, "tt0137523")
    assert r["imdb_id"] == "tt0137523"
    assert r["tmdb_id"] == 550
    assert r["overview"].startswith("A ticking")
    assert r["tagline"] == "Mischief. Mayhem. Soap."
    assert r["runtime"] == 139
    assert r["collection_id"] == 9
    assert r["collection_name"] == "Fight Club Collection"
    assert r["budget"] == 63000000
    assert r["tmdb_vote_average"] == 8.4
    assert r["tmdb_genres"] == ["Drama"]
    assert r["keywords"] == ["dual identity", "nihilism"]
    assert r["spoken_languages"] == ["English"]
    assert r["production_countries"] == ["United States of America"]
    assert r["production_companies"] == ["Fox 2000 Pictures"]
    assert r["director"] == ["David Fincher"]
    assert set(r["writers"]) == {"Jim Uhls", "Chuck Palahniuk"}
    assert r["composer"] == "Dust Brothers"
    assert r["cinematographer"] == "Jeff Cronenweth"
    assert r["producers"] == ["Art Linson"]
    assert r["cast"][0] == {"name": "Edward Norton", "character": "The Narrator", "order": 0}
    assert len(r["cast"]) == 2


def test_parse_record_tolerates_missing_sections():
    r = parse_record({"id": 1}, "tt0000001")
    assert r["imdb_id"] == "tt0000001"
    assert r["tmdb_id"] == 1
    assert r["overview"] == ""
    assert r["collection_id"] is None
    assert r["tmdb_genres"] == []
    assert r["keywords"] == []
    assert r["director"] == []
    assert r["composer"] is None
    assert r["cast"] == []


def test_blurb_of_keeps_only_present_fields():
    assert blurb_of(parse_record(RAW, "tt0137523")) == {
        "overview": "A ticking-time-bomb insomniac...",
        "tagline": "Mischief. Mayhem. Soap.",
        "runtime": 139,
    }


def test_blurb_of_omits_empty_and_zero():
    r = parse_record({"id": 1, "overview": "", "tagline": "", "runtime": 0}, "tt0000001")
    assert blurb_of(r) == {}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_tmdb_meta.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'moviewords_pipeline.tmdb_meta'`

- [ ] **Step 3: Write the implementation**

```python
# pipeline/src/moviewords_pipeline/tmdb_meta.py
"""Shape raw TMDB detail (+credits,+keywords) payloads into a flat analysis
record and the minimal per-film blurb sidecar. Pure functions — no network."""

CAST_LIMIT = 20


def _names(items, key="name"):
    return [i[key] for i in (items or []) if isinstance(i, dict) and i.get(key)]


def _crew_by_job(crew, jobs):
    return [c["name"] for c in (crew or [])
            if c.get("job") in jobs and c.get("name")]


def parse_record(raw: dict, imdb_id: str) -> dict:
    raw = raw or {}
    coll = raw.get("belongs_to_collection") or {}
    credits = raw.get("credits") or {}
    crew = credits.get("crew") or []
    cast = sorted((c for c in (credits.get("cast") or []) if c.get("name")),
                  key=lambda c: c.get("order", 1_000_000))[:CAST_LIMIT]
    kw = (raw.get("keywords") or {}).get("keywords") or []
    composers = _crew_by_job(crew, {"Original Music Composer", "Music", "Composer"})
    dops = _crew_by_job(crew, {"Director of Photography", "Cinematography"})
    return {
        "imdb_id": imdb_id,
        "tmdb_id": raw.get("id"),
        "original_title": raw.get("original_title") or "",
        "overview": raw.get("overview") or "",
        "tagline": raw.get("tagline") or "",
        "runtime": raw.get("runtime") or 0,
        "release_date": raw.get("release_date") or "",
        "status": raw.get("status") or "",
        "homepage": raw.get("homepage") or "",
        "adult": bool(raw.get("adult", False)),
        "collection_id": coll.get("id"),
        "collection_name": coll.get("name"),
        "budget": raw.get("budget") or 0,
        "revenue": raw.get("revenue") or 0,
        "tmdb_popularity": raw.get("popularity"),
        "tmdb_vote_average": raw.get("vote_average"),
        "tmdb_vote_count": raw.get("vote_count"),
        "tmdb_genres": _names(raw.get("genres")),
        "keywords": _names(kw),
        "spoken_languages": [s.get("english_name") or s.get("name")
                             for s in (raw.get("spoken_languages") or [])
                             if s.get("english_name") or s.get("name")],
        "production_countries": _names(raw.get("production_countries")),
        "production_companies": _names(raw.get("production_companies")),
        "director": _crew_by_job(crew, {"Director"}),
        "writers": _crew_by_job(crew, {"Writer", "Screenplay", "Story",
                                       "Novel", "Author"}),
        "composer": composers[0] if composers else None,
        "cinematographer": dops[0] if dops else None,
        "producers": _crew_by_job(crew, {"Producer"}),
        "cast": [{"name": c["name"], "character": c.get("character", ""),
                  "order": c.get("order", 0)} for c in cast],
    }


def blurb_of(record: dict) -> dict:
    out = {}
    if record.get("overview"):
        out["overview"] = record["overview"]
    if record.get("tagline"):
        out["tagline"] = record["tagline"]
    if record.get("runtime"):
        out["runtime"] = record["runtime"]
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_tmdb_meta.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/moviewords_pipeline/tmdb_meta.py pipeline/tests/test_tmdb_meta.py
git commit -m "feat(pipeline): TMDB metadata record shaping (parse_record, blurb_of)"
```

---

### Task 2: Pipeline — `fetch_tmdb_meta.py` fetch + parquet build

The runnable script: fetch one detail call per film into the raw cache + write the sidecar blurb; a `build_parquet` step consolidates the cache into `tmdb_meta.parquet`. Driven by the published `movies-index.json` (no local parquet needed), resumable, robust.

**Files:**
- Create: `pipeline/scripts/fetch_tmdb_meta.py`
- Test: `pipeline/tests/test_fetch_tmdb_meta.py`

**Interfaces:**
- Consumes: `parse_record`, `blurb_of` (Task 1); `tmdb.make_session`, `tmdb.BASE`, `config`.
- Produces: `detail(session, imdb_id) -> dict | None` (raw payload), `build_parquet(cache_dir: Path, out_path: Path) -> int` (rows written).

- [ ] **Step 1: Write the failing test** (parquet build is pure over a cache dir; no network)

```python
# pipeline/tests/test_fetch_tmdb_meta.py
import importlib.util
import json
from pathlib import Path

import duckdb

SPEC = importlib.util.spec_from_file_location(
    "fetch_tmdb_meta",
    Path(__file__).resolve().parents[1] / "scripts" / "fetch_tmdb_meta.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def test_build_parquet_from_raw_cache(tmp_path):
    cache = tmp_path / "tmdb_meta"
    cache.mkdir()
    (cache / "tt0137523.json").write_text(json.dumps({
        "id": 550, "overview": "o", "tagline": "t", "runtime": 139,
        "genres": [{"name": "Drama"}],
        "keywords": {"keywords": [{"name": "nihilism"}]},
        "credits": {"cast": [{"name": "Edward Norton", "character": "N", "order": 0}],
                    "crew": [{"name": "David Fincher", "job": "Director"}]},
    }))
    (cache / "tt0000002.json").write_text(json.dumps(None))  # no-match: skipped
    out = tmp_path / "tmdb_meta.parquet"

    rows = mod.build_parquet(cache, out)

    assert rows == 1
    got = duckdb.sql(f"SELECT imdb_id, tmdb_id, tmdb_genres, keywords, director, "
                     f"cast FROM '{out}'").fetchall()
    assert got[0][0] == "tt0137523"
    assert got[0][1] == 550
    assert got[0][2] == ["Drama"]
    assert got[0][3] == ["nihilism"]
    assert got[0][4] == ["David Fincher"]
    assert got[0][5][0]["name"] == "Edward Norton"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd pipeline && uv run pytest tests/test_fetch_tmdb_meta.py -q`
Expected: FAIL — `FileNotFoundError`/`ModuleNotFoundError` for the missing script.

- [ ] **Step 3: Write the script**

```python
# pipeline/scripts/fetch_tmdb_meta.py
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
    if raw_path.exists():
        raw = json.loads(raw_path.read_text())
    else:
        try:
            raw = detail(session, imdb_id)
        except Exception as exc:  # never let one film kill the batch
            print(f"tmdb-meta {imdb_id}: {exc}", flush=True)
            return "failed"
        _write_json(raw_path, raw)  # 'null' cached too
    if raw is None:
        return "no-match"
    blurb = blurb_of(parse_record(raw, imdb_id))
    if blurb:
        _write_json(BLURB_OUT / f"{imdb_id}.json", blurb)
    return "ok"


def load_ids(data_base):
    url = f"{data_base}/all/json/movies-index.json"
    return [m["id"] for m in requests.get(url, timeout=60).json()]


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
    jsonl.write_text("\n".join(json.dumps(r) for r in records))
    if records:
        duckdb.sql(
            f"COPY (SELECT * FROM read_json_auto('{jsonl}', format='newline_delimited')) "
            f"TO '{out_path}' (FORMAT parquet)")
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd pipeline && uv run pytest tests/test_fetch_tmdb_meta.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/scripts/fetch_tmdb_meta.py pipeline/tests/test_fetch_tmdb_meta.py
git commit -m "feat(pipeline): fetch_tmdb_meta script (raw cache, blurb sidecar, parquet)"
```

---

### Task 3: Publish — Cache-Control rule for `json/blurb/**`

Blurb files are static once fetched, so give them a long TTL like the trend bake, and keep them out of the 5-minute generic-json rule.

**Files:**
- Modify: `pipeline/scripts/upload_r2.sh` (the three ordered `rclone copy` blocks)

- [ ] **Step 1: Add blurb to the long-TTL group and exclude it from the 5-minute group**

In the **first** `rclone copy` block (the `max-age=3600` group), add blurb filters right after the existing trend `+` filters:

```bash
  --filter '+ json/blurb/**' --filter '+ all/json/blurb/**' \
```

In the **second** `rclone copy` block (the `max-age=300` group), add matching excludes right after the existing trend `-` filters (before `--filter '+ *.json'`):

```bash
  --filter '- json/blurb/**' --filter '- all/json/blurb/**' \
```

After the edit, the first block’s filter list reads (trend rules then blurb rules then `- *`), and the second block excludes trend **and** blurb before `+ *.json`.

- [ ] **Step 2: Verify the script still parses**

Run: `bash -n pipeline/scripts/upload_r2.sh && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add pipeline/scripts/upload_r2.sh
git commit -m "chore(pipeline): cache json/blurb long-TTL, keep out of 5-min json rule"
```

---

### Task 4: App — `getMovieBlurb` (404-tolerant)

A lazy, missing-file-tolerant fetch for the sidecar, with its own in-flight cache (the shared `fetchOne` throws on non-200 and must not be reused here).

**Files:**
- Modify: `app/src/lib/data.ts` (add interface + function near `getMovie`)
- Test: `app/src/lib/data.test.ts` (append a describe block)

**Interfaces:**
- Produces: `interface MovieBlurb { overview?: string; tagline?: string; runtime?: number }`
- Produces: `getMovieBlurb(id: string): Promise<MovieBlurb | null>` — resolves `null` on 404/any fetch error.

- [ ] **Step 1: Write the failing test**

```ts
// append to app/src/lib/data.test.ts
describe('getMovieBlurb', () => {
  it('returns the parsed blurb on 200', async () => {
    const data = await withLangs([])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ overview: 'o', runtime: 139 })))
    expect(await data.getMovieBlurb('tt1')).toEqual({ overview: 'o', runtime: 139 })
  })

  it('returns null when the sidecar is missing (404)', async () => {
    const data = await withLangs([])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    expect(await data.getMovieBlurb('tt2')).toBeNull()
  })

  it('returns null when fetch rejects', async () => {
    const data = await withLangs([])
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await data.getMovieBlurb('tt3')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm run test -- data.test.ts`
Expected: FAIL — `getMovieBlurb is not a function`.

- [ ] **Step 3: Implement**

Add near the `MovieDetail` interface:

```ts
export interface MovieBlurb {
  overview?: string
  tagline?: string
  runtime?: number
}
```

Add near `getMovie` (uses its own cache so a 404 caches as `null`, not an error):

```ts
const blurbCache = new Map<string, Promise<MovieBlurb | null>>()

/** Lazy, 404-tolerant blurb sidecar. Missing file -> null (page renders fine). */
export function getMovieBlurb(id: string): Promise<MovieBlurb | null> {
  const url = globalUrl(`json/blurb/${id}.json`)
  if (!blurbCache.has(url)) {
    blurbCache.set(
      url,
      fetch(url)
        .then((res) => (res.ok ? (res.json() as Promise<MovieBlurb>) : null))
        .catch(() => null),
    )
  }
  return blurbCache.get(url) as Promise<MovieBlurb | null>
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm run test -- data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/data.ts app/src/lib/data.test.ts
git commit -m "feat(app): getMovieBlurb 404-tolerant sidecar fetch"
```

---

### Task 5: App — tri-state POS filter (state + logic)

Change `pos` from a `Set` to a `Map<string,'include'|'exclude'>`, add the rotation helper and the compose semantics. Update existing tests (which used `Set`) and add tri-state coverage.

**Files:**
- Modify: `app/src/components/WordFilter.tsx` (types, `defaultFilter`, `passesFilter`, add `rotatePos`)
- Test: `app/src/components/WordFilter.test.ts`

**Interfaces:**
- Produces: `type PosState = 'include' | 'exclude'`
- Produces: `WordFilterState.pos: Map<string, PosState>`
- Produces: `rotatePos(pos: Map<string, PosState>, c: string): Map<string, PosState>` — off→include→exclude→off.
- Consumes (unchanged): `rowPos`, `COMMON_ZIPF`.

- [ ] **Step 1: Update existing tests + add tri-state tests (failing)**

Replace the `passesFilter: word kinds` describe block and add a `rotatePos` block. Existing rows/`f` helper stay:

```ts
import { defaultFilter, passesFilter, rotatePos, rowPos, type WordRow } from './WordFilter'
// (add rotatePos to the existing import)

const inc = (...cs: string[]) => new Map(cs.map((c) => [c, 'include' as const]))

describe('passesFilter: word kinds (include/exclude)', () => {
  const rows = [know, sheriff, reckon, quickly, beautiful, wilson]
  it('empty selection shows every kind', () => {
    expect(rows.filter((r) => passesFilter(r, f({ common: 'all' })))).toHaveLength(rows.length)
  })
  it('single include shows only that kind', () => {
    expect(rows.filter((r) => passesFilter(r, f({ common: 'all', pos: inc('n') })))).toEqual([sheriff])
  })
  it('multiple includes union kinds', () => {
    expect(rows.filter((r) => passesFilter(r, f({ common: 'all', pos: inc('n', 'v') }))))
      .toEqual([know, sheriff, reckon])
  })
  it('a single exclude hides only that kind, shows the rest', () => {
    const pos = new Map([['n', 'exclude' as const]])
    expect(rows.filter((r) => passesFilter(r, f({ common: 'all', pos }))))
      .toEqual([know, reckon, quickly, beautiful, wilson])
  })
  it('excludes win and includes still restrict when both are set', () => {
    const pos = new Map([['v', 'include' as const], ['x', 'exclude' as const]])
    // includes present -> only verbs; exclude of x is moot here but must not throw
    expect(rows.filter((r) => passesFilter(r, f({ common: 'all', pos })))).toEqual([know, reckon])
  })
  it('include filters compose with interesting mode', () => {
    expect(rows.filter((r) => passesFilter(r, f({ pos: inc('n') })))).toEqual([sheriff])
  })
})

describe('rotatePos', () => {
  it('cycles off -> include -> exclude -> off', () => {
    let pos = new Map<string, 'include' | 'exclude'>()
    pos = rotatePos(pos, 'n'); expect(pos.get('n')).toBe('include')
    pos = rotatePos(pos, 'n'); expect(pos.get('n')).toBe('exclude')
    pos = rotatePos(pos, 'n'); expect(pos.has('n')).toBe(false)
  })
  it('does not mutate the input map', () => {
    const pos = new Map<string, 'include' | 'exclude'>()
    rotatePos(pos, 'n')
    expect(pos.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app && npm run test -- WordFilter.test.ts`
Expected: FAIL — `rotatePos` undefined and `pos` type mismatch.

- [ ] **Step 3: Implement the state + logic**

In `WordFilter.tsx` replace the types, `defaultFilter`, and `passesFilter`, and add `rotatePos`:

```ts
export type PosState = 'include' | 'exclude'

export interface WordFilterState {
  /** 'interesting' hides everyday English (stopwords + Zipf ≥ 5). */
  common: 'interesting' | 'all'
  /** Per-kind include/exclude; absent key = neutral. Empty = every kind. */
  pos: Map<string, PosState>
}

export const defaultFilter = (): WordFilterState => ({
  common: 'interesting',
  pos: new Map(),
})
```

```ts
export function passesFilter(row: WordRow, f: WordFilterState, stopwords?: Set<string>): boolean {
  if (f.common === 'interesting') {
    const zipf = typeof row[2] === 'number' ? row[2] : 0
    if (zipf >= COMMON_ZIPF || stopwords?.has(row[0])) return false
  }
  if (f.pos.size > 0) {
    const p = rowPos(row)
    if (f.pos.get(p) === 'exclude') return false
    let hasIncludes = false
    for (const v of f.pos.values()) if (v === 'include') { hasIncludes = true; break }
    if (hasIncludes && f.pos.get(p) !== 'include') return false
  }
  return true
}

/** off -> include -> exclude -> off. Returns a new map (never mutates). */
export function rotatePos(pos: Map<string, PosState>, c: string): Map<string, PosState> {
  const next = new Map(pos)
  const cur = next.get(c)
  if (cur === undefined) next.set(c, 'include')
  else if (cur === 'include') next.set(c, 'exclude')
  else next.delete(c)
  return next
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app && npm run test -- WordFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/WordFilter.tsx app/src/components/WordFilter.test.ts
git commit -m "feat(app): tri-state POS filter state + include/exclude compose logic"
```

---

### Task 6: App — tri-state chip UI + hint line

Render the three visual states and rewrite the `WordFilterBar` interactions and hint copy. Uses `rotatePos` from Task 5.

**Files:**
- Modify: `app/src/components/WordFilter.tsx` (`WordFilterBar`, chip class helpers)

**Interfaces:**
- Consumes: `rotatePos`, `PosState`, `POS_CHIPS`.

- [ ] **Step 1: Replace the chip class helper and `WordFilterBar`**

Replace `chipCls` and the `WordFilterBar` component body. Keep the commonness toggle group unchanged; only the POS chips and hint change:

```tsx
const chipCls = (state: PosState | undefined) => {
  const base = 'border-2 px-2 py-0.5'
  if (state === 'include') return `${base} border-ink bg-mark font-bold`
  if (state === 'exclude') return `${base} border-ink-3 text-ink-3 line-through`
  return `${base} border-ink hover:bg-mark`
}

const ariaState = (label: string, state: PosState | undefined) =>
  state === 'include' ? `${label}: included (click to exclude)`
    : state === 'exclude' ? `${label}: excluded (click to reset)`
      : `${label}: off (click to include)`
```

```tsx
export function WordFilterBar({
  filter,
  onChange,
}: {
  filter: WordFilterState
  onChange: (f: WordFilterState) => void
}) {
  const rotate = (c: string) => onChange({ ...filter, pos: rotatePos(filter.pos, c) })
  const included = POS_CHIPS.filter(([c]) => filter.pos.get(c) === 'include').map(([, l]) => l)
  const excluded = POS_CHIPS.filter(([c]) => filter.pos.get(c) === 'exclude').map(([, l]) => l)
  return (
    <div className="mt-3 font-script text-xs">
      <div className="flex flex-wrap items-center gap-2 border-2 border-ink bg-card p-2">
        <div className="flex" role="group" aria-label="Word commonness">
          <button
            onClick={() => onChange({ ...filter, common: 'interesting' })}
            aria-pressed={filter.common === 'interesting'}
            className={`border-2 border-ink px-2 py-0.5 ${filter.common === 'interesting' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            interesting words
          </button>
          <button
            onClick={() => onChange({ ...filter, common: 'all' })}
            aria-pressed={filter.common === 'all'}
            className={`-ml-0.5 border-2 border-ink px-2 py-0.5 ${filter.common === 'all' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            all words
          </button>
        </div>
        <span className="text-ink-3" aria-hidden>
          |
        </span>
        <button
          onClick={() => onChange({ ...filter, pos: new Map() })}
          aria-pressed={filter.pos.size === 0}
          className={filter.pos.size === 0 ? 'border-2 border-ink bg-mark px-2 py-0.5 font-bold' : 'border-2 border-ink px-2 py-0.5 hover:bg-mark'}
        >
          any kind
        </button>
        {POS_CHIPS.map(([c, label]) => {
          const state = filter.pos.get(c)
          return (
            <button
              key={c}
              onClick={() => rotate(c)}
              aria-label={ariaState(label, state)}
              className={chipCls(state)}
            >
              {state === 'exclude' ? `− ${label}` : label}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-ink-3">
        {filter.common === 'interesting'
          ? 'hiding everyday English - the ~2,000 most common words (the, know, get…)'
          : 'showing every word, including everyday English'}
        {included.length > 0 && ` · only ${included.join(', ')}`}
        {excluded.length > 0 && ` · hiding ${excluded.join(', ')}`}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + full app test suite**

Run: `cd app && npx tsc -b && npm run test`
Expected: no type errors; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/WordFilter.tsx
git commit -m "feat(app): tri-state POS chips UI (include/exclude/off) + hint copy"
```

---

### Task 7: App — movie page details + IMDb links

Render the blurb block, link poster + rating to IMDb, move the decade link to the header year, and add the runtime + words/min stats.

**Files:**
- Modify: `app/src/views/Movie.tsx`

**Interfaces:**
- Consumes: `getMovieBlurb`, `MovieBlurb` (Task 4).

- [ ] **Step 1: Add the blurb state + fetch**

Update imports and add state/effect:

```tsx
import type { MovieBlurb, MovieDetail, MovieIndexEntry } from '../lib/data'
import { getMovie, getMovieBlurb, getMovieIndex } from '../lib/data'
```

Inside `MovieView`, add alongside the other state:

```tsx
  const [blurb, setBlurb] = useState<MovieBlurb | null>(null)
```

In the existing `useEffect`, after the `getMovieIndex()` line:

```tsx
    setBlurb(null)
    getMovieBlurb(id).then(setBlurb).catch(() => {})
```

- [ ] **Step 2: Extend `Stat` to support an optional IMDb link**

Replace the `Stat` component:

```tsx
function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <div className="font-script text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-ink-2">{label}</div>
    </>
  )
  const cls = 'block border-2 border-ink bg-card px-4 py-3'
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-mark`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
```

- [ ] **Step 3: Add an IMDb URL, link the header year, and the poster**

Just after `if (!movie) return ...`, add:

```tsx
  const imdbUrl = `https://www.imdb.com/title/${movie.imdb_id}/`
  const decade = Math.floor(movie.year / 10) * 10
```

Change the `Slug` text so the year links to the decade (replace the `text={...}` prop with a `text` that carries a link — `Slug` renders `text` as a node, so pass JSX):

```tsx
      <Slug
        text={
          <>
            {movie.title} -{' '}
            <a href={`#/decade/${decade}`} className="hover:bg-mark" title={`More from the ${decade}s`}>
              {movie.year}
            </a>
          </>
        }
        ...
```

Note: `Slug`’s `text` prop is typed `string`. Widen it to `React.ReactNode` in `app/src/components/ui.tsx` (the `Slug` signature: `text: React.ReactNode`). It is already rendered inside `<span>{text}</span>`, so no other change is needed.

Replace the poster anchor (currently the decade link) with an IMDb link:

```tsx
        <a
          href={imdbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-28 shrink-0 sm:w-36"
          title={`${movie.title} on IMDb`}
        >
          <Poster id={movie.imdb_id} title={movie.title} className="w-full border-2 border-ink" />
        </a>
```

- [ ] **Step 4: Add runtime + words/min stats and link the rating**

Replace the stat grid’s inner tiles. Make it a 6-tile grid:

```tsx
        <div className="grid flex-1 grid-cols-2 content-start gap-3 sm:grid-cols-3">
          <Stat label="Words spoken" value={movie.stats.total_words.toLocaleString()} />
          <Stat label="Distinct words" value={movie.stats.unique_words.toLocaleString()} />
          <Stat
            label="Vocabulary richness"
            value={`${((movie.stats.unique_words / movie.stats.total_words) * 100).toFixed(1)}%`}
          />
          <Stat
            label="Words per minute"
            value={movie.stats.words_per_minute != null ? Math.round(movie.stats.words_per_minute).toString() : '—'}
          />
          <Stat label="Runtime" value={blurb?.runtime ? `${blurb.runtime} min` : '—'} />
          <Stat label="IMDb rating" value={meta ? meta.rating.toFixed(1) : '—'} href={imdbUrl} />
        </div>
```

- [ ] **Step 5: Render the blurb block**

Immediately after the closing `</div>` of the poster/stats flex row (before `<WordFilterBar .../>`):

```tsx
      {(blurb?.tagline || blurb?.overview) && (
        <div className="mt-5 border-l-2 border-ink-3 pl-4">
          {blurb.tagline && (
            <p className="font-script text-sm italic text-ink-2">“{blurb.tagline}”</p>
          )}
          {blurb.overview && <p className="mt-1 max-w-prose text-sm text-ink">{blurb.overview}</p>}
        </div>
      )}
```

- [ ] **Step 6: Typecheck + build + tests**

Run: `cd app && npx tsc -b && npm run test`
Expected: no type errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/views/Movie.tsx app/src/components/ui.tsx
git commit -m "feat(app): movie blurb block, IMDb links (poster+rating), runtime + words/min stats"
```

---

### Task 8: Verify end-to-end with real sample data

Generate a few real blurb files locally, point the dev server at local data, and confirm blurb, IMDb links, and tri-state filters render correctly.

**Files:** none (verification only)

- [ ] **Step 1: Fetch a small real sample** (TMDB key is in the env)

```bash
cd pipeline && uv run python - <<'PY'
import sys; from pathlib import Path; sys.path.insert(0, 'src')
sys.argv = ['x']  # argparse no-op
import scripts.fetch_tmdb_meta as m
from moviewords_pipeline.tmdb import make_session
m.CACHE.mkdir(parents=True, exist_ok=True)
s = make_session()
for tid in ['tt0111161', 'tt0468569', 'tt0137523']:
    print(tid, m.fetch_one(s, tid))
print('blurbs at', m.BLURB_OUT, sorted(p.name for p in m.BLURB_OUT.glob('*.json')))
PY
```
Expected: three `ok`, three files under `pipeline/webdata/out/all/json/blurb/`.

- [ ] **Step 2: Serve local data + run the app against it**

In one shell, serve the generated tree so `/all/json/blurb/<id>.json` resolves:

```bash
cd pipeline/webdata/out && python3 -m http.server 8788
```

In another, run the dev server pointed at it (port 5173 is mandatory for CORS):

```bash
cd app && VITE_DATA_BASE=http://localhost:8788 npm run dev -- --port 5173
```

- [ ] **Step 3: Manual checks** — use the `run` skill / browser to open `http://localhost:5173/#/movie/tt0111161` and confirm:
  - blurb block shows tagline (if any) + overview; runtime stat populated; words/min populated.
  - poster and the IMDb-rating tile open `https://www.imdb.com/title/tt0111161/` in a new tab; the header year links to `/#/decade/1990`.
  - clicking a POS chip cycles highlight → struck-through `−` → plain; the hint line reads "only …" / "hiding …"; "any kind" resets.
  - a movie id with no blurb file (e.g. one you didn’t fetch) still renders cleanly with no blurb block.

- [ ] **Step 4: No commit** (verification task). Record findings; fix regressions by revisiting the relevant task.

---

## Self-review notes

- **Spec coverage:** blurb sidecar (T1–T2, T4, T7), three-tier storage incl. full-credits parquet (T1–T2), publish cache rule (T3), poster+rating→IMDb & decade-on-year (T7), runtime+tagline+words/min (T1/T4/T7), tri-state chips off→include→exclude→off (T5–T6), tests (T1,T2,T4,T5,T6), ship split & sample verify (T8). All covered.
- **Type consistency:** `MovieBlurb` fields match `blurb_of` output; `pos: Map<string,PosState>` used consistently across `defaultFilter`/`passesFilter`/`rotatePos`/`WordFilterBar`; `Slug.text` widened to `React.ReactNode` where JSX is passed.
- **No placeholders:** every code step contains the actual code; commands include expected output.
