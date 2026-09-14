# Analytics for Movie Words — design

**Date:** 2026-09-14
**Status:** approved, pre-implementation
**Branch:** `worktree-analytics`

## Goal

Add lightweight, **free, cookieless** analytics so that once the site launches
publicly (Hacker News etc.) we can see the traffic it gets, and later mine that
data for a launch-retrospective dev blog post. Priority is reliable *traffic
shape* — how many visitors, from where, to which sections, over time — not
per-user engagement or funnels.

## Principles

- **Cookieless, no consent banner.** The owner is UK-based; a banner is ugly on
  an otherwise clean site and suppresses data. All chosen tools store no
  personal data and set no cookies, so no banner is required.
- **Three independent sources.** Each stands alone; if one is blocked by an
  adblocker or removed, the others still report. The launch audience is
  dev-heavy and heavily adblocked, so redundancy matters.
- **Minimal code surface.** One script tag, one small module, one hook into
  existing routing. No backend (the site is a static SPA on Cloudflare Pages).

## The three sources

### 1. Cloudflare Web Analytics — trustworthy baseline

The site is a static SPA deployed to **Cloudflare Pages**
(`wrangler pages deploy dist --project-name moviewords`). Web Analytics is
enabled by a **dashboard toggle on the Pages project**; Cloudflare injects the
beacon at the edge.

- **Zero repo code**, no token to manage, nothing to keep in sync.
- First-party beacon → largely survives adblockers.
- Captures the launch essentials at page-load time: **visits, referrers,
  countries, Core Web Vitals**.
- The hash-router limitation (below) does not hurt this source: arrival and
  referrer are captured on the initial load regardless of the URL fragment.

**External setup (owner):** In the Cloudflare dashboard, open the `moviewords`
Pages project → Metrics/Analytics → enable Web Analytics. No code change.

### 2. GoatCounter — the data we own (for the blog post)

Cloudflare Web Analytics is great live but a walled garden later (~6-month
retention, no clean export). GoatCounter is free for non-commercial use,
cookieless, gives full referrer/path detail, exports raw data, and has an
optionally-public dashboard (an on-brand touch for a data-transparency site).

- **Endpoint:** `https://goat.moviewords.org/count` — a vanity domain. A
  **DNS-only** (unproxied) CNAME `goat.moviewords.org → moviewords.goatcounter.com`
  is created in Cloudflare (done 2026-09-14); DNS-only is required so GoatCounter
  provisions its own TLS cert. The vanity endpoint only responds once
  `goat.moviewords.org` is saved under GoatCounter → Settings → Domain settings →
  Custom domain (owner step). Until then, fall back to
  `https://moviewords.goatcounter.com/count`.
  - ⚠️ The vanity domain is **cosmetic, not adblocker evasion** - GoatCounter's
    own docs say so, because `count.js` still loads from `gc.zgo.at`. Cloudflare
    Web Analytics remains the adblocker-resilient source.
- Script tag added to `app/index.html`, configured with **`no-onload`** so the
  app controls counting rather than GoatCounter's default auto-count-on-load.
  This is required to make hash navigation countable (see below).

### 3. Google Search Console — how Google sees the site

Orthogonal to the above: query/impression/indexing data, not visitor
analytics. Free. No app code.

- **External setup (owner):** add the property for `moviewords.org`, verify via
  DNS TXT record (managed in Cloudflare), submit a minimal sitemap.
- ⚠️ **Honest caveat:** the app is a **hash router**, so Google sees effectively
  one URL (`/`) — fragments are ignored for indexing. GSC data will therefore be
  site-wide, not per-section. This is an SEO limitation, not an analytics one,
  and is **out of scope** to fix here.

## The hash-router wrinkle (the one real engineering piece)

Routing is custom and **hash-based** (`app/src/lib/route.ts`): routes look like
`#/trends`, `#/movie/123?word=love`. The fragment changes but the path stays
`/`. Trackers that auto-count only observe the History API (`pushState`), so the
entire SPA would collapse into a single `/` pageview.

**Fix:** fire a manual pageview to GoatCounter on every `hashchange`.

### `app/src/lib/analytics.ts` (new)

A tiny module exporting `trackPageview()`:

- Reads `window.location.hash`.
- Derives a **clean path** — the chosen grain is **section + first id**:
  - `#/` or empty → `/`
  - `#/trends?word=love` → `/trends` (query params stripped)
  - `#/movie/123?word=love` → `/movie/123`
  - `#/genre/Sci-Fi` → `/genre/Sci-Fi` (decoded id kept)
  - Query params are always dropped to avoid path-cardinality blow-up.
  - Keeping the first id is a deliberate cheap win: it yields "most-viewed
    films / entities" — good blog material — without per-user tracking.
- Calls `window.goatcounter?.count({ path, title: document.title })`.
- **Guards:** no-op if `window.goatcounter` is not yet loaded (async script);
  skip duplicate consecutive counts for the same path.

### Wiring

Hook `trackPageview()` into the code that already listens for `hashchange` —
the `useRoute` effect in `app/src/lib/route.ts` (or a one-line effect in
`App.tsx`). Fire once on initial load, then on every route change.

## Privacy note

All three sources are cookieless and store no personal data → no banner. Add a
one-line privacy statement to `docs/FAQ.md` (and optionally the footer) stating
this. Good citizenship and on-brand for a data-transparency site.

## Testing

- **Unit** (`app/src/lib/analytics.test.ts`, vitest — matches existing
  `*.test.ts` convention): the path-normalizer is a pure function. Cover home
  (`#/`, empty), section-only (`#/trends`), section + id (`#/movie/123`),
  query-param stripping (`#/trends?word=love`), and encoded/decoded ids
  (`#/genre/Sci-Fi`).
- **Manual:** `npm run dev`, navigate between sections, confirm GoatCounter
  receives events (network beacon to `moviewords.goatcounter.com` + dashboard
  shows data — the "no data received" message clears). Verify Cloudflare Web
  Analytics and GSC in their dashboards post-deploy.

## Work split

**Code (in this repo):**
- GoatCounter script tag in `app/index.html` (with `no-onload`).
- `app/src/lib/analytics.ts` + wiring into routing.
- `app/src/lib/analytics.test.ts`.
- Privacy note in `docs/FAQ.md`.

**External (owner, with step-by-step guidance):**
- Toggle Cloudflare Web Analytics on the `moviewords` Pages project.
- Verify Google Search Console + DNS TXT, submit sitemap.
- (GoatCounter account already created.)

## Out of scope (flagged, not done)

- Converting hash routing → History API for real per-page SEO (large change,
  separate decision).
- `robots.txt` / full sitemap beyond the homepage (trivial to add later if GSC
  asks).
- Engagement/funnel/session-replay instrumentation (traffic-shape was the
  chosen depth; PostHog/GA4 explicitly not used).
- Google Analytics 4 (rejected: needs a consent banner in the UK/EU, script is
  adblocked by much of the launch audience, painful UI).
