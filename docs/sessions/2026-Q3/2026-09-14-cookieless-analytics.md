# Cookieless analytics — shipped & wired to prod — 2026-09-14

**Project:** moviewords   **Branch/commit:** main @ cd4f540 (PR #11 squash-merged + a footer follow-up commit)   **Status:** done — live at https://moviewords.org

## Summary

Added free, cookieless analytics so the site's public launch (HN etc.) can be
measured and later mined for a dev blog post. Brainstormed the options, chose a
banner-free three-source stack, built the one real engineering piece
(hash-aware pageview tracking), shipped it via subagent-driven development,
merged and deployed to prod, then did all the external dashboard/API setup:
Cloudflare Web Analytics, GoatCounter (+ vanity domain), and Google Search
Console. Also did a footer copy/attribution tweak the user requested, and fixed
a stray commit that had landed on local `main`.

All three sources are **live and recording** as of end of session.

## The stack (why cookieless)

User is UK-based with a dev-heavy (heavily adblocked) launch audience, and
wanted "traffic shape" not per-user engagement. That ruled out GA4 (needs a
consent banner in UK/EU, adblocked, painful UI) and made PostHog overkill.
Chosen: **cookieless, no consent banner**.

1. **Cloudflare Web Analytics** — the trustworthy baseline (first-party beacon,
   adblocker-resilient). Enabled via the Pages project → Metrics tab → "Enable"
   toggle. siteTag `e266fdcace664adb85176c3ec4131d5a`. Auto-injects
   `static.cloudflareinsights.com/beacon.min.js` at the edge. No repo code.
2. **GoatCounter** — the data-you-own source (full export, public-dashboard
   option), for the blog post. Site code `moviewords`. Script in
   `app/index.html` with `window.goatcounter = { no_onload: true }` before the
   async `count.js`, so the SPA controls counting.
3. **Google Search Console** — how Google sees the site (queries/impressions).
   Domain property `sc-domain:moviewords.org`, DNS-TXT verified.

## What changed

**Code (PR #11, squash-merged as 86ea439):**
- `app/src/lib/analytics.ts` (new) — `pathFromHash(hash)` (pure: section +
  first id, query stripped, `#/movie/123?word=love` → `/movie/123`, `#/` → `/`)
  and `trackPageview()` which snapshots the path once and fires
  `window.goatcounter.count({path,title})`, deduping and retrying (bounded,
  ~3s) while the async `count.js` loads.
- `app/src/lib/analytics.test.ts` (new) — 6 vitest cases for `pathFromHash`
  (node env, pure fn only).
- `app/index.html` — GoatCounter script (`goat.moviewords.org/count` vanity
  endpoint) + `no_onload`.
- `app/src/App.tsx` — single root `useEffect` calling `trackPageview()` on load
  and every `hashchange`. Wired in App (NOT in `useRoute`, which multiple
  components import as a param reader).
- `docs/FAQ.md` — cookieless-analytics privacy note.
- Spec + plan under `docs/superpowers/{specs,plans}/2026-09-14-analytics*`.

**Footer follow-up (cd4f540, direct to main):**
- Shortened the "Grab the data" dataset line to one line.
- Merged the two TMDB attribution lines into one and removed the TMDB logo
  `<img>` (kept the required "not endorsed or certified by TMDB" disclaimer
  text — see Decisions).

**External state created/changed (via API with MOVIEWORDS_CF_TOKEN + browser):**
- DNS: `goat.moviewords.org` CNAME → `moviewords.goatcounter.com`, **DNS-only**
  (unproxied, so GoatCounter provisions its own TLS). Now verified by GoatCounter.
- DNS: TXT on `moviewords.org` =
  `google-site-verification=yi2aCg7ewIC3n2LUdeUTf6sqUX6yNIXZ40w39uwxGik` (GSC).
  Must stay to keep GSC verification.
- Cloudflare Web Analytics enabled on the `moviewords` Pages project.
- `MOVIEWORDS_CF_TOKEN` (user token `moviewords-admin`) gained
  **Account Analytics: Read** — verified it reads CF Web Analytics via the
  GraphQL API (`POST api.cloudflare.com/client/v4/graphql`,
  `viewer.accounts.rumPageloadEventsAdaptiveGroups`).
- GoatCounter custom domain `goat.moviewords.org` saved (user did this) — now
  verified + serving.
- GSC domain property added + verified.
- Two prod deploys via `wrangler pages deploy dist --project-name moviewords
  --branch main` (Pages project is direct-upload, `source: None`, so merging to
  main does NOT auto-deploy).

## Decisions & rationale

- **Cookieless three-source stack over GA4** — no banner, trustworthy through
  adblock, richer blog material; GA4's cost/benefit was bad for this audience.
- **Section + first-id path grain** for GoatCounter — gives section totals AND
  "top films/entities viewed" (good blog material) without per-user tracking.
- **Vanity beacon domain kept despite being cosmetic** — GoatCounter's own docs
  say a custom domain is NOT adblock evasion (`count.js` still from `gc.zgo.at`);
  it's just a nicer first-party-looking endpoint. CF Web Analytics remains the
  adblock-resilient source.
- **Removed the TMDB logo image** — TMDB's terms require attributing them as
  source but don't mandate the logo *image* specifically; the disclaimer text
  ("This product uses the TMDB API but is not endorsed or certified by TMDB")
  plus the existing metadata/posters credits satisfy attribution. Verified
  against themoviedb.org/about/logos-attribution before removing.
- **GSC verified via manual TXT (not the Cloudflare OAuth flow)** — avoids
  granting Google ongoing DNS access; added the TXT via the scoped token instead.
- **No sitemap submitted** — hash router means Google sees only `/`, so a
  sitemap adds ~nothing.

## Learnings / gotchas

- **Cloudflare Pages Web Analytics injects the beacon only on deployments
  created AFTER you enable it.** I deployed, then enabled WA, and the beacon was
  absent from served HTML on every domain. A redeploy fixed it immediately. If
  the CF beacon is missing, redeploy.
- **Hash router breaks default analytics.** Routes are `#/trends` etc.; the
  server path is always `/`, and auto-counters only see `pushState`. Hence the
  manual `trackPageview()` on `hashchange`, snapshotting the path so a fast
  navigation during the async `count.js` load can't drop the landing view.
- **A workflow subagent committed on a STALE base.** The Task-3 (FAQ) implementer
  created its commit with parent `e269e23` (pre-analytics), landing it directly
  on the *primary* worktree's `main` (4e6699a) instead of the feature branch.
  Recovered by cherry-picking into the branch; later reset local `main` to
  `origin/main`. Watch for subagents that run git in the wrong worktree.
- **Reading CF Web Analytics via API needs `Account Analytics` permission**, and
  it's the **GraphQL** Analytics API, not the RUM `site_info` REST endpoints
  (those are management calls and 401'd). Account-level GraphQL query aggregates
  ALL RUM sites on the account — filter by `siteTag` for moviewords-only.
- **GoatCounter vanity domain**: DNS-only CNAME is required; GoatCounter
  re-checks every 2h then provisions TLS. It was dark for a bit, now verified.

## Open threads & next steps

- **Nothing blocking.** All three sources are live and recording.
- Data will accrue over days (GSC especially). Revisit after the launch to pull
  numbers for the blog post — CF via GraphQL (token has the scope), GoatCounter
  via its dashboard/export, GSC via the dashboard or MCP.
- Optional someday: robots.txt + sitemap; converting the hash router to the
  History API would unlock real per-page SEO (big change, deliberately deferred).
- Unrelated: primary worktree had an uncommitted `pipeline/.../config.py` change
  not from this session — left untouched, flagged to Andrew (`/fix-main`).

## Related docs

- Spec: `docs/superpowers/specs/2026-09-14-analytics-design.md`
- Plan: `docs/superpowers/plans/2026-09-14-analytics.md`
- Prior same-day work: `2026-09-14-pre-hn-hardening-domain-migration.md`,
  `2026-09-14-live-audit-stale-cache-upload-r2-fix.md`
