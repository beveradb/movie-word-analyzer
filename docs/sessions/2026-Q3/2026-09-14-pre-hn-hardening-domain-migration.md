# Pre-HN review, hardening ship, moviewords.org migration, repo rename — 2026-09-14

**Project:** moviewords   **Branch/commit:** main @ c2bcd9e (PRs #6, #7, #9, all squash-merged + deployed)   **Status:** done — live at https://moviewords.org

## Summary

One long session in four acts, prompted by "make sure this survives an HN
post": (1) a five-angle pre-launch review of repo + live site, (2) shipping
every fix from it (PR #6 via /shipit), (3) buying moviewords.org and moving
site + data onto it fully (PR #7), (4) renaming the repo to
beveradb/moviewords (PR #9). A parallel session shipped the homepage UX
overhaul (PR #8) in between; its record is separate.

## What changed

**Review findings that mattered (all fixed in PR #6):**
- duckdb-wasm was downloading ENTIRE parquets - one Trends visit = ~107MB.
  Root cause hunt went through CORS, Chrome cache poisoning, and worker XHR
  instrumentation (BroadcastChannel monkey-patch before importScripts) before
  landing on: this build behaves as if `forceFullHTTPReads` is on, skipping
  range detection. Fix in `app/src/lib/duck.ts`:
  `db.open({ filesystem: { forceFullHTTPReads: false, reliableHeadRequests:
  true } })` → the same query moves ~200KB of ranged 206s.
- Homepage loaded the 7MB engine for the featured chart → pre-baked
  `json/featured-series.json` + `featured` stage in rebuild_web_data.py,
  DuckDB fallback if the bake is stale.
- No Cache-Control on R2 objects (`cf-cache-status: DYNAMIC` on everything) →
  rewrote metadata on all 18.8k json/parquet objects via boto3 server-side
  copy; `upload_r2.sh` now sets it on upload; Cache Rules on both zones.
- Legal gaps: no LICENSE file, no on-site TMDB/IMDb attribution, poster
  policy undocumented → LICENSE, LICENSE-DATA.md, footer attribution block
  (IMDb courtesy line, TMDB logo+notice, takedown line), docs/FAQ.md
  (methodology + limitations + copyright position), linked from README,
  footer, homepage.
- Also: OG/twitter tags + og:image + apple-touch-icon, error boundary,
  un-memoized failed engine init, Leaderboard year-input debounce (was one
  full-file scan per keystroke), session-doc redactions (work account name,
  GCP project id, secret-file paths), em-dash sweep in site copy.

**Domain migration (PR #7 + infra):**
- Registered moviewords.org via CF Registrar ($8.50 yr1, renews $11.20,
  auto-renew, WHOIS redacted). Zone active instantly.
- Pages custom domains moviewords.org + www (www 301→apex via redirect
  rule); R2 custom domain data.moviewords.org on the same bucket; cache rule
  on the new zone; bucket CORS extended (new origins + old prod +
  localhost 5173/4173).
- moviewords.beveradb.com 301s to moviewords.org (rule appended on
  beveradb.com zone, existing HTTP→HTTPS rule preserved).
  moviewords-data.beveradb.com deliberately kept as a serving ALIAS (no
  redirect) so cached old bundles keep working - retire it later.
- Hostname sweep: DATA_BASE, poster base, OG URLs, README/DATA/ARCHITECTURE/
  LICENSE-DATA/fetch_published.sh.

**Repo rename (PR #9):** GitHub repo → beveradb/moviewords (`gh repo
rename`; old URLs redirect), in-repo links/titles updated, remotes repointed.
Local clone dir renamed to `~/Projects/beveradb/moviewords` at session end.

## Decisions & rationale

- **moviewords.org over .app/.com-variants** - Andrew's pick; matches the
  wordmark and the non-commercial ethos; moviewords.com was taken.
- **Old data hostname stays serving, old site hostname redirects** - cached
  bundles reference the old DATA_BASE; a 301 on data requests risks CORS
  friction, an alias costs nothing.
- **`MOVIEWORDS_CF_TOKEN`** (in `moviewords/.envrc`, gitignored): scoped CF
  token minted so ALL Cloudflare work is API-driven from now on - zones
  moviewords.org + beveradb.com (DNS, cache/redirect/transform rules, zone
  settings, SSL) + account Pages/R2. The old CLOUDFLARE_API_TOKEN in the
  parent .envrc still exists for R2-S3 creds derivation and wrangler deploys.

## Learnings / gotchas

- **duckdb-wasm 1.33.1-dev57 full-read behavior**: see ARCHITECTURE.md
  performance lessons. Verify range fixes in a FRESH browser profile - Chrome
  serves cached full 200s to range probes and fakes "ranges unsupported".
- **Minting CF tokens / purging cache without dashboard clicking**: the
  logged-in dash session (playwright-chrome-3) can call
  `dash.cloudflare.com/api/v4/...` with `credentials: 'include'` +
  `x-cross-site-security: dash` header - used for POST /user/tokens (token
  creation UI is unautomatable react-select soup). Permission group ids come
  from GET /user/tokens/permission_groups.
- **Cloudflare serves ranged 206s from edge cache** once a cache rule makes
  the host eligible - MISS→HIT verified on range requests, so DuckDB's
  chunked reads ride the CDN.
- **The old API token could attach R2 custom domains but not touch DNS or
  rulesets** - R2's API creates its own DNS record with CF's authority.
- **In-place R2 metadata rewrite**: boto3 `copy_object` with
  `MetadataDirective='REPLACE'` (rclone can't do it without re-upload; its
  same-name server-side copyto no-ops).
- **Stripe checkout (domain purchase) needs Andrew** - Link 2FA code to his
  phone; drive to the payment page and hand over.
- **GitGuardian + WIP are the only PR checks**; `gh pr merge` complains
  "main is already used by worktree" but the remote merge succeeds anyway.

## Open threads & next steps

- **www.moviewords.org Pages attachment** was still "pending" cert at session
  end - traffic already works via the zone 301 to apex; should self-resolve;
  check `gh`/API if it lingers.
- **Retire moviewords-data.beveradb.com alias** (and its cache rule + CORS
  entry + redirect-eligible hostname) after a week or two of new-domain-only
  bundles.
- **Old beveradb.com Pages custom domain** (moviewords.beveradb.com) is still
  attached to the Pages project; the zone 301 fires first so it's inert -
  detach whenever.
- **HN launch checklist leftovers**: no analytics (decide before posting);
  check what featured trend lands on launch day; GCP VM
  moviewords-pipeline-tmp still running, credits expire ~2026-09-19.
- Pre-existing lint errors in LineChart.tsx (rules-of-hooks) - untouched,
  still there.

## Related docs

- docs/sessions/2026-Q3/2026-09-14-homepage-ux-overhaul.md (parallel session,
  PR #8)
- docs/FAQ.md, LICENSE-DATA.md (new this session)
- docs/ARCHITECTURE.md - performance lessons gained the range-read and
  cache-control entries
