# Handoff: bake per-word Trends data so the client never boots DuckDB-WASM

**For:** the pipeline session (dual-corpus worktree).
**From:** the Trends mobile-perf investigation on `main`.
**Status:** pipeline work to implement here; the matching frontend change is
being built in a separate worktree and will consume exactly the schema below.

---

## Why (root cause, one paragraph)

The Trends page (`/#/trends?w=<word>`) is the only common path that boots a
**35 MB DuckDB-WASM engine in the browser** to run its SQL live against the
parquets. On desktop Chrome that engine stays cached/compiled and it's
invisible. On **Firefox for Android** the browser evicts the big wasm from its
small cache and **re-downloads + re-compiles ~35 MB of WASM on every reload**,
which is the "QUERYING CORPUS…" hang (60 s+) the user reported. It is **not**
data transfer — the per-word data is tiny and range reads are ~250 ms.
Confirmed on-device: the featured chart (no engine, reads baked JSON) is
instant; `?w=ring` (engine) hangs.

The fix mirrors the pattern already used for the homepage featured chart
(`stage_featured` → `json/featured-series.json`, consumed by
`loadFeaturedSeries`): **pre-bake the data so the client fetches a few-KB JSON
instead of loading a SQL engine.** `word_year.parquet` already contains only
the **58,389 chartable words** (everything below the ≥20-use threshold is
excluded and the UI rejects it), so we can bake **every** word — no Cloudflare
Worker, no runtime compute, ~$0/month.

Scope: **Trends only.** Leaderboard's *filtered* mode (arbitrary year-range ×
genre) and Compare (arbitrary movie sets) are combinatorial and stay on the
engine for now — out of scope here.

---

## What to build

### 1. New stage `stage_trends` in `pipeline/scripts/rebuild_web_data.py`

Writes one small JSON per chartable word to `OUT/json/trend/<key>.json`, plus a
single shared `OUT/json/year-totals.json`. Because it writes to the module-level
`OUT`, it inherits the dual-corpus `set_corpus()` repointing automatically:
`en` → `json/trend/…`, `all` → `all/json/trend/…`. No corpus-specific code
needed in the stage itself.

Register it in `STAGES` and include it in `--stage all`.

Data sources (all already available as views/inputs via `connect()`):
- `word_year` view — `(word, year, count)` — the chart line + denominators.
- `words_by_movie` view — `(imdb_id, word, count)` — top films + top-per-year.
- `movies` view — `(imdb_id, title, year, total_words, …)` — join for titles.

> Note: the *app* currently reads `words_by_word/data.parquet` for these tables,
> but that's the same tuples as `words_by_movie` sorted by word for range reads.
> The bake should use the local `words_by_movie` view — identical results.

#### Output schema — `json/trend/<key>.json`

Compact arrays (no per-object keys — keep files tiny). One file per word:

```json
{
  "line":   [[year, count], ...],
  "top":    [[imdb_id, title, year, count, total_words], ...],
  "byYear": [[year, imdb_id, title, count], ...]
}
```

- `line`: every `(year, count)` for this word from `word_year`, ascending by
  year. Raw counts (the client divides by `year-totals` to get the per-million
  rate). ~38 entries avg, 110 max.
- `top`: up to **15** films that say the word most, ordered by `count DESC`
  (tiebreak `title ASC`). Fields in order: `imdb_id, title, year, count,
  total_words`. `total_words` is required — the UI shows a "/1k words"
  secondary stat (`count / total_words * 1000`).
- `byYear`: the **single top film per year** for this word — one row per year
  the word appears, ascending by year. Ordered/selected by
  `ROW_NUMBER() OVER (PARTITION BY year ORDER BY count DESC, title) = 1`.
  Fields in order: `year, imdb_id, title, count`.

Typical sizes (verified): `serendipity` 1.6 KB, `ring` 6.0 KB, `love` 6.3 KB,
`the` 7.3 KB. **58,389 files × ~4 KB avg ≈ ~230 MB** uncompressed. R2 storage
≈ $0.003/mo; egress free.

#### Output schema — `json/year-totals.json`

Whole-corpus dialogue-word total per release year (the rate denominator, shared
by all words). Same numbers as `featured-series.json`'s `totals`, standalone so
the Trends path doesn't have to load the featured payload. **Include every year**
(the client needs the full map to compute the plotted-year range, not just years
a given word appears in). ~110 entries, ~2 KB.

```json
{ "1930": 12345678, "1931": 13456789, ... }
```

(Value = `SELECT year, SUM(count) FROM word_year GROUP BY year`. This is already
computed in `stage_featured`; feel free to factor it out or just recompute.)

#### Reference implementation

```python
from urllib.parse import quote

def _word_key(w: str) -> str:
    # RFC3986 unreserved stays literal; everything else percent-encoded
    # (UTF-8, uppercase hex). MUST match the frontend encoder exactly — see
    # "Filename/URL key encoding" below.
    return quote(w, safe="")

def stage_trends(con):
    out = OUT / "json" / "trend"
    out.mkdir(parents=True, exist_ok=True)

    # shared denominators
    totals = con.sql("SELECT year, SUM(count)::BIGINT FROM word_year GROUP BY year").fetchall()
    (OUT / "json" / "year-totals.json").write_text(
        json.dumps({str(y): t for y, t in totals}))

    # line: word -> [[year, count], ...]
    line = {}
    for w, y, c in con.execute(
        "SELECT word, year, count::BIGINT FROM word_year ORDER BY word, year"
    ).fetchall():
        line.setdefault(w, []).append([y, c])

    # top: word -> up to 15 [[imdb_id, title, year, count, total_words], ...]
    top = {}
    for w, iid, title, yr, c, tw in con.execute("""
        SELECT word, imdb_id, title, year, count, total_words FROM (
          SELECT wm.word, wm.imdb_id, m.title, m.year,
                 wm.count::BIGINT AS count, m.total_words::BIGINT AS total_words,
                 ROW_NUMBER() OVER (PARTITION BY wm.word ORDER BY wm.count DESC, m.title) AS rn
          FROM words_by_movie wm JOIN movies m USING (imdb_id)
        ) WHERE rn <= 15 ORDER BY word, count DESC, title
    """).fetchall():
        top.setdefault(w, []).append([iid, title, yr, c, tw])

    # byYear: word -> [[year, imdb_id, title, count], ...] (top film per year)
    by_year = {}
    for w, yr, iid, title, c in con.execute("""
        SELECT word, year, imdb_id, title, count FROM (
          SELECT wm.word, m.year, wm.imdb_id, m.title, wm.count::BIGINT AS count,
                 ROW_NUMBER() OVER (PARTITION BY wm.word, m.year ORDER BY wm.count DESC, m.title) AS rn
          FROM words_by_movie wm JOIN movies m USING (imdb_id)
        ) WHERE rn = 1 ORDER BY word, year
    """).fetchall():
        by_year.setdefault(w, []).append([yr, iid, title, c])

    n = 0
    for w, ln in line.items():                      # word_year is the source of truth
        payload = {"line": ln, "top": top.get(w, []), "byYear": by_year.get(w, [])}
        (out / f"{_word_key(w)}.json").write_text(json.dumps(payload, separators=(",", ":")))
        n += 1
    print(f"  wrote {n} trend JSONs")
```

Perf: the two window queries scan the full `words_by_movie` (~tens of millions
of rows). If memory is tight, use `QUALIFY` and/or stream by word instead of
materializing dicts — you know the pipeline's sort-order contracts
(`docs/ARCHITECTURE.md`) better than I do. Correctness of the schema is what the
frontend depends on; the query strategy is yours.

### 2. `pipeline/scripts/upload_r2.sh` — caching for the new files (optional but nice)

`json/trend/*.json` and `json/year-totals.json` only change on a full rebuild,
so the default 5-minute JSON `Cache-Control` is needlessly short for 58k files.
Consider a longer TTL for the trend tree specifically, e.g. add before the
generic json copy:

```bash
rclone copy . r2:moviewords-data/ --checksum --progress \
  --include 'json/trend/**' --include 'json/year-totals.json' \
  --header-upload "Cache-Control: public, max-age=3600"
```

…and add matching `--exclude 'json/trend/**' --exclude 'json/year-totals.json'`
to the existing generic `--include '*.json'` copy so they aren't re-uploaded
with the 5-min header. The post-upload `purge_everything` still swaps versions
on deploy. This is a minor optimization — skip if it complicates the dual-corpus
upload flow.

### 3. `fetch_published.sh` — no change expected

The stage reads only inputs already mirrored (`movies`, `words_by_movie`,
`word_year`). No new inputs.

---

## Filename/URL key encoding — MUST match the frontend exactly

A word becomes a filename and a URL path segment. Words contain apostrophes
(`don't`), hyphens, and non-ASCII. Both sides use **RFC3986 percent-encoding of
everything except unreserved `A–Z a–z 0–9 - _ . ~`** (UTF-8 bytes, uppercase
hex):

- **Pipeline (Python):** `quote(word, safe="")` — the reference above.
- **Frontend (JS):** plain `encodeURIComponent` leaves `! ' ( ) *` literal,
  which `quote` encodes — so the frontend uses:
  ```js
  const key = encodeURIComponent(word)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  ```
  (The frontend side is already specified in the frontend worktree; noted here
  so the two encoders are provably identical.)

Words are already lowercased by the app before charting, and `word_year` keys
are lowercase, so **bake the key from the stored (lowercase) word** — no case
folding needed. Do not alter the word before encoding.

58k files in a single `json/trend/` directory is fine for apfs/ext4 and R2's
flat keyspace. Shard by first char/hash only if a local tool struggles.

---

## Validation before shipping

1. `python scripts/rebuild_web_data.py --corpus en --stage trends` (and
   `--corpus all` if baking both) writes `json/year-totals.json` + a
   `json/trend/*.json` count equal to `SELECT COUNT(*) FROM (SELECT DISTINCT
   word FROM word_year)` (expect ~58,389 for `en`).
2. Spot-check a few against the current live queries — the served files should
   reproduce today's Trends output. Reference (`en`, `ring`):
   - `line`: 102 entries; top film `top[0]` = `tt0120737` *The Lord of the Rings:
     The Fellowship of the Ring* (2001), count 104.
   - `byYear` 2001 → same film, count 104; 1952 → *The Greatest Show on Earth*
     (`tt0044672`), count 40.
3. Confirm apostrophe/unicode words resolve: e.g. bake key for `don't` must be
   `don%27t.json`; fetch `https://data.moviewords.org/json/trend/don%27t.json`
   after upload returns 200.
4. Upload with `upload_r2.sh`, verify a couple of URLs 200 with the expected
   `Cache-Control`.

---

## Interface contract the frontend depends on (do not drift)

- Paths: `json/trend/<key>.json` and `json/year-totals.json`, under the corpus
  prefix (`en` flat, `all` under `all/`).
- Exact array field order in `line` / `top` / `byYear` as above.
- `top` includes `total_words`; `byYear` is one row per year (top film only).
- `year-totals.json` contains **all** years, value = whole-corpus SUM(count).
- Key encoding = RFC3986 unreserved-safe percent-encoding (above).

The frontend will fall back to the existing live DuckDB path for any word whose
file 404s (stale/missing bake), logging a `console.warn` — same safety valve as
`loadFeaturedSeries`. So a partial bake degrades gracefully rather than breaking
Trends, but the goal is 100% coverage of `word_year`.
