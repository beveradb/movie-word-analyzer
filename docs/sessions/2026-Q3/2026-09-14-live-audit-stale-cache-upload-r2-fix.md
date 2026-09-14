# Live-site audit, stale-cache root cause, upload_r2.sh rewrite, instant Trends chart — 2026-09-14

**Project:** moviewords   **Branch/commit:** main @ b0716f8 (PR #10, squash-merged + deployed)   **Status:** done — verified live on moviewords.org

## Summary

Andrew asked for a /recap plus a live-site review to confirm the pre-HN
launch prep actually landed - he suspected the homepage and Trends still
loaded "50MB". The audit found the range-read and cache fixes DID land, but
a stale edge-cached `featured-series.json` was silently pushing the homepage
onto the full DuckDB engine download. Fixed live (purge), then shipped the
class fix as PR #10: upload_r2.sh rewritten (it was pointing at a dead dir
and would have deleted the bucket), json TTL dropped to 5 min bucket-wide,
purge-on-upload wired in, and Trends' featured chart moved onto the
pre-baked JSON so it paints instantly.

## What changed

**Audit findings (fresh isolated browser profiles + curl):**
- Range reads: confirmed working. Trends does 64KB ranged 206s against all
  three parquets, edge-cached (MISS→HIT). ~2-3MB data per visit vs the old
  107MB.
- The "50MB" was Firefox's DECODED column. True wire cost of a cold Trends:
  ~10MB (duckdb-eh.wasm is 35.9MB decoded but 7.1MB brotli from jsdelivr,
  cached immutable for a year; + 3.2MB→~1.5MB zstd parquet extension).
- **Live bug:** the edge (per-colo) served the OLD 14-word
  featured-series.json (cached 19:31, three minutes before the 160-word
  upload; the earlier session's purge didn't stick because the object serves
  with `Vary: Origin` and a plain single-URL purge misses variants). Today's
  featured words weren't in it → `loadFeaturedSeries` silently fell back to
  the engine on EVERY homepage visit. Purged with the variant headers named
  → homepage back to ~150KB / 6 requests, no wasm.

**PR #10 (merged b0716f8, deployed):**
- `pipeline/scripts/upload_r2.sh` rewritten. Old version: `rclone sync` of
  the long-gone `data/out` dir - run against the real (usually partial)
  `pipeline/webdata/out` it would have DELETED most of the bucket. New:
  additive `rclone copy`, Cache-Control json=300s / parquet+posters=86400,
  then zone-wide purge via `MOVIEWORDS_CF_TOKEN` (warns and continues if
  unset/failed; graceful zone-lookup failure was a review finding).
- `app/src/views/Trends.tsx`: featured trends (no `?w=`) chart from the
  pre-baked JSON like the homepage - no more seconds of "Querying corpus…";
  the engine still warms in the background for tooltip top-movie notes;
  user-typed words keep the live query path. Verified live: featured chart
  renders with ZERO word_year.parquet requests.
- `app/src/lib/series.ts`: console.warn when the bake fallback fires (it
  silently costs visitors the engine download - never let it hide again).
- Docs: ARCHITECTURE.md (diagram `rclone sync`→`copy`, new cache/purge
  lessons incl. the Vary-variant purge trap), rebuild_web_data.py docstring.

**Ops (out-of-band, all verified):**
- `MOVIEWORDS_CF_TOKEN` (moviewords-admin) granted **Cache Purge** via the
  logged-in dash session (PUT /user/tokens/:id with all existing permission
  groups + e17beae8b8cb423a99b1730f21238bed) - purge now works by API, no
  dash needed.
- Ran the new upload_r2.sh end-to-end for real (copy no-op + purge OK).
- Rewrote Cache-Control to max-age=300 on ALL 18,771 `json/` objects via
  boto3 `copy_object` `MetadataDirective='REPLACE'` (48 threads, ~1 min) -
  needed because `rclone copy --checksum` skips byte-identical files WITHOUT
  updating their headers. Verified: json serves 300, parquet still 86400.

## Decisions & rationale

- **Zone-wide purge in the script, not per-URL** - `Vary: Origin` means a
  per-URL purge must name every Origin variant; purge_everything is robust
  and the only cost is a brief cold edge (Pages assets are hashed, refill).
- **json=300s TTL as backstop, parquets keep 24h** - json is what gets
  rebuilt often and bit us; parquet version swaps are handled by the purge
  and If-Range/ETag revalidation.
- **Trends featured chart from the bake** - same graceful-fallback path the
  homepage uses (`loadFeaturedSeries`), so stepping ◀/▶ is instant too (all
  160 words are in one cached fetch).
- PR opened WITHOUT `@coderabbitai ignore` (no local CodeRabbit possible;
  bot not installed anyway); subagent review found 2 real issues, both fixed
  pre-merge.

## Learnings / gotchas

- **Cloudflare purge + `Vary: Origin`:** single-URL purge
  (`{"files":["url"]}`) does NOT clear variant copies; use
  `{"files":[{"url":..., "headers":{"Origin":"https://moviewords.org"}}]}`
  or purge the zone. This is why the earlier session's purge "worked" at its
  colo but left others stale.
- **DevTools size columns lie about cost:** Firefox/Chrome "Size" is decoded
  bytes; judge transfer by the status-bar "transferred" figure. jsdelivr
  brotli-compresses the 35.9MB wasm to 7.1MB (curl without brotli support
  reports the full size - check `content-encoding` with browser-like
  Accept-Encoding before concluding "uncompressed").
- **`rclone copy --checksum` never rewrites headers on unchanged objects** -
  bulk Cache-Control changes need the boto3 server-side copy trick.
- **R2 S3 creds are derived, not stored:** access_key = CLOUDFLARE_API_TOKEN's
  id (from /user/tokens/verify), secret = sha256 hex of the token value.
- Worker-context fetches (duckdb-wasm XHRs) don't appear in the page's
  `performance.getEntriesByType('resource')` - use CDP network capture
  (chrome-devtools MCP list_network_requests) to see them.
- Site headings are CSS-`uppercase` - innerText assertions must be
  case-insensitive (bit me again this session).
- gcloud auth was stale; after `! gcloud auth login` the account is
  admin@nomadkaraoke.com, VM project is `nomadkaraoke`.

## Open threads & next steps

- **DO NOT DELETE GCP VM moviewords-pipeline-tmp** (nomadkaraoke,
  us-central1-a): Andrew plans a NEW session to bring the translated
  (non-English-original) movies into the full corpus using its caches.
  **Credits expire ~2026-09-19 - do this within days.**
- HN launch leftovers from the prior session still open: analytics decision;
  check the day's featured trend before posting; retire the
  moviewords-data.beveradb.com alias later; og.png says "98 million" vs
  ~127M actual.
- Pre-existing LineChart.tsx rules-of-hooks lint errors - still untouched.

## Related docs

- docs/sessions/2026-Q3/2026-09-14-pre-hn-hardening-domain-migration.md (the
  session whose fixes this audit verified)
- docs/sessions/2026-Q3/2026-09-14-homepage-ux-overhaul.md (the 160-word bake
  whose stale edge copy caused the regression)
- docs/ARCHITECTURE.md - performance lessons updated with the purge/Vary trap
