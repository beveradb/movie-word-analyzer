# Trends mobile perf — diagnose 35MB DuckDB-WASM boot, ship per-word static bake — 2026-09-14

**Project:** moviewords   **Branch/commit:** main @ 6368350 (PR #13, squash-merged + deployed)   **Status:** done — live on prod, verified on-device

## Summary

Andrew reported the Trends page (`/#/trends?w=<word>`) hanging on "QUERYING
CORPUS…" for ~a minute on his phone (Firefox Android). Investigated, found the
root cause was the **client-side DuckDB-WASM engine cold-boot (a 35 MB wasm)**,
not data transfer. Fixed it by having the frontend consume **pre-baked per-word
JSON** instead of running SQL in the browser — so the Trends page loads zero
WASM. Split the work: the pipeline bake was handed off to the parallel
dual-corpus session (shipped in their PR #12); this session built and shipped
the **frontend** (PR #13), then verified the win on-device once the bake went
live.

Result on prod (Firefox Android, cold start): chart now renders in **~3s with no
"QUERYING" phase**, fetching **~8 KB of JSON** and **zero WASM** — down from
~7–9s warm / ~60s cold-throttled and a 35 MB engine download+compile.

## What changed

**Investigation (systematic-debugging + real measurement):**
- Ruled out the first (wrong) hypothesis — "the 3.5 MB `word_year` scan / edge
  `cf-cache-status: DYNAMIC`". That scan is ~280 ms; irrelevant. Andrew
  corrected that it wasn't bandwidth (same wifi, reproducible in Firefox
  Android).
- Measured the real cost in-browser (Chrome MCP, CPU-throttled) and via an
  in-page benchmark: DuckDB-WASM engine = **`duckdb-eh.wasm` 35 MB**
  (brotli on the wire, but decoded+compiled in full). Engine init + queries are
  sub-second once cached; the pain is downloading+compiling 35 MB on mobile.
- On-device (Pixel 9 Pro via adb, screencap timing): load is **word-independent**
  (`ring` == `coffee`) and **Chrome ≈ Firefox** — both ~7–10s cold when plugged
  in; ~60s in Andrew's earlier throttled/first-visit reloads. Confirmed by his
  resource logger: CPU 50–79% + an ~8 MB/s NET burst = the wasm downloading and
  compiling. Net finding: a ~7s *minimum* engine tax for a few-KB chart,
  ballooning under throttle.
- Discriminator (Andrew confirmed on-device): the featured `#/trends` landing
  (baked JSON, no engine) is instant; `?w=<word>` (engine) hangs. Proved it's the
  engine, not the page.

**Fix — pipeline (handed off, shipped by the dual-corpus session as PR #12):**
- Wrote a detailed handoff spec:
  `docs/superpowers/specs/2026-09-14-trends-static-bake-pipeline-handoff.md`
  (schema, `stage_trends` reference code, key-encoding contract, sizing,
  validation). The other session implemented it verbatim.
- Bake: `json/trend/<key>.json` per word (`line`/`top`/`byYear`) +
  `json/year-totals.json`, for every chartable word in `word_year` (~58k en,
  ~104k all), per corpus (`en` flat, `all` under `all/`). Fully static, no
  Worker, ~$0.

**Fix — frontend (this session, PR #13, squash 6368350):**
- `app/src/lib/trends.ts`: `wordKey()` (RFC3986 percent-encoder), `TrendFile`
  type, pure `trendYearRows`/`trendTopFilms`/`trendByYear` transforms (+13 tests).
- `app/src/lib/series.ts`: `loadTrends()` fetches year-totals + per-word files
  via the corpus-aware `dataUrl()`; **404 = "not enough data"** (folds into
  `toSeries` missing), any **other failure → live-engine fallback**
  (`loadTrendsEngine`, the old queries) — same contract as `loadFeaturedSeries`.
  Every requested word is seeded with an empty top-films list.
- `app/src/views/Trends.tsx`: one `loadTrends` call replaces the three DuckDB
  call sites; `TopFilms` is now presentational. Featured path unchanged.
- Rebased onto the merged dual-corpus main (`dataUrl`/corpus toggle) — no
  conflicts.
- Deployed: `npm run build` → `wrangler pages deploy dist --project-name
  moviewords --branch=main` (sourced `../.envrc` for `CLOUDFLARE_API_TOKEN` in
  the same shell call).

## Decisions & rationale

- **Static per-word bake, no Cloudflare Worker** — `word_year` is already
  pre-filtered to eligible words, so ALL are bakeable; per-word payloads are
  1.6–7.3 KB. Fully static keeps it at ~$0 (Andrew's explicit cost constraint)
  and matches the existing `featured-series.json` pattern.
- **Split pipeline vs frontend across sessions** — the dual-corpus session was
  already reworking the pipeline; handed them the bake via a spec file to avoid
  conflicts, kept the frontend here.
- **Ship the frontend before the bake was live** — the engine fallback makes it a
  no-op until the data lands, then it auto-switches. Safe, and unblocked shipping.
- **Fallback distinguishes 404 from other errors** — a below-threshold word
  (404) must NOT boot the engine (that's the whole point); only genuine
  fetch/network failures fall back.

## Learnings / gotchas

- **The 60s was the tail, not the norm.** On a modern plugged-in phone both
  Chrome and Firefox are ~7–10s; the ~60s is throttled/unplugged or
  first-visit/cache-evicted. Still unacceptable for a few-KB chart, but the
  headline is "engine tax removed", not "always 60s → instant".
- **R2/Cloudflare percent-decodes the request path once before key lookup**
  (their PR #16): trend object keys are the **raw word** (`don't.json`), and the
  frontend sends the **percent-encoded** URL (`don%27t.json`) which the edge
  decodes to match. `wordKey` (encode) is correct precisely because of this.
  Verified: `don%27t`, `i%27m`, `can%27t` all 200.
- **`wordKey` must match Python `quote(w, safe="")`** — `encodeURIComponent`
  leaves `!'()*` literal, so we additionally percent-encode those.
- **Deploy auth lives in a parent-dir `.envrc`** (`/Users/andrew/Projects/
  beveradb/.envrc`: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`); wrangler
  isn't OAuth-logged-in. Must `source` it in the SAME Bash call as wrangler
  (shell state doesn't persist between calls). No CI auto-deploy — deploy is
  manual `wrangler pages deploy`.
- **adb driving Firefox Android**: `am force-stop` + `am start -a VIEW -d URL`
  gives a reproducible cold start; screencap-every-Ns with host timestamps is a
  good-enough time-to-render measure. Phone must be unlocked (PIN/biometric
  blocks adb swipe-unlock). USB can drop mid-session.
- Review caught a real regression: presentational `TopFilms` spun forever for a
  data-less word (map had no entry → `null` → permanent spinner). Fixed by
  seeding `[]` for every requested word.

## Open threads & next steps

- Leaderboard **filtered** mode (year-range × genre) and **Compare** (arbitrary
  movie sets) still boot the 35 MB engine — combinatorial, not fully bakeable.
  Less-common paths, but the same mobile cost; candidates for a future
  server-side query endpoint or narrower bakes if they matter at launch.
- Cleaning up the `moviewords-trends-static-bake` worktree (`/cleanup`).
- Rich before/after material captured (adb screenshots, resource-log spike) for
  the planned dev blog post.

## Related docs

- `docs/superpowers/specs/2026-09-14-trends-static-bake-pipeline-handoff.md` — the bake spec
- `docs/sessions/2026-Q3/2026-09-14-dual-corpus-bake-ship.md` — the parallel session (PRs #12/#14/#15/#16, incl. the bake + raw-key fix)
- PR #13 — the frontend change (this session)
