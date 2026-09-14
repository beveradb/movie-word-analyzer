# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free, cookieless analytics (Cloudflare Web Analytics + GoatCounter) with hash-aware SPA pageview tracking, so launch traffic can be measured and later mined for a blog post.

**Architecture:** Cloudflare Web Analytics is enabled by a dashboard toggle (no repo code). GoatCounter is added via a script tag in `index.html` configured with `no_onload`, plus a small pure `analytics.ts` module that derives a clean path from the URL hash and fires a manual pageview on every `hashchange`. Google Search Console is external setup only.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 5 (node test env — no jsdom), GoatCounter `count.js`.

## Global Constraints

- Site is a static SPA on Cloudflare Pages; **no backend**. All analytics are client-side.
- **Cookieless, no consent banner** — do not add cookies, localStorage keys, or any personal-data collection.
- Routing is **hash-based** (`#/trends`, `#/movie/123?word=love`); the server-visible path is always `/`.
- Path grain for GoatCounter = **section + first id**, query params stripped (e.g. `#/movie/123?word=love` → `/movie/123`).
- GoatCounter endpoint: `https://goat.moviewords.org/count` (vanity domain; DNS-only CNAME → `moviewords.goatcounter.com` already created). Requires the GoatCounter custom-domain setting to be saved before it responds (see rollout checklist); fall back to `https://moviewords.goatcounter.com/count` if not yet configured.
- Test convention: co-located `*.test.ts` using Vitest; tests run in **node** (no DOM) — only pure functions get unit tests. Run with `npm test` (from `app/`).
- Copy style: use " - " (spaced hyphen), never em-dashes.

---

### Task 1: `analytics.ts` module (pure path-normalizer + pageview tracker)

**Files:**
- Create: `app/src/lib/analytics.ts`
- Test: `app/src/lib/analytics.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `pathFromHash(hash: string): string` — pure; maps `window.location.hash` to a clean analytics path.
  - `trackPageview(): void` — reads `window.location.hash`, dedupes, and calls `window.goatcounter.count(...)`; retries while the async script loads. Used by Task 2.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pathFromHash } from './analytics'

describe('pathFromHash', () => {
  it('maps empty and root hashes to /', () => {
    expect(pathFromHash('')).toBe('/')
    expect(pathFromHash('#')).toBe('/')
    expect(pathFromHash('#/')).toBe('/')
  })

  it('keeps a bare section', () => {
    expect(pathFromHash('#/trends')).toBe('/trends')
  })

  it('strips query params', () => {
    expect(pathFromHash('#/trends?word=love')).toBe('/trends')
  })

  it('keeps section + first id', () => {
    expect(pathFromHash('#/movie/123')).toBe('/movie/123')
    expect(pathFromHash('#/movie/123?word=love')).toBe('/movie/123')
  })

  it('drops segments beyond the first id', () => {
    expect(pathFromHash('#/movie/123/extra')).toBe('/movie/123')
  })

  it('decodes encoded ids, tolerating malformed input', () => {
    expect(pathFromHash('#/genre/Sci-Fi')).toBe('/genre/Sci-Fi')
    expect(pathFromHash('#/genre/Action%20%26%20Adventure')).toBe('/genre/Action & Adventure')
    expect(pathFromHash('#/genre/%E0%A4%A')).toBe('/genre/%E0%A4%A')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- analytics` (from `app/`)
Expected: FAIL — `pathFromHash` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/lib/analytics.ts`:

```ts
declare global {
  interface Window {
    goatcounter?: {
      count?: (opts: { path: string; title?: string }) => void
      no_onload?: boolean
    }
  }
}

/** decodeURIComponent that never throws on malformed input. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Map a location.hash to a clean analytics path: section + first id, query
 * params dropped. `#/movie/123?word=love` -> `/movie/123`, `#/` -> `/`. */
export function pathFromHash(hash: string): string {
  const withoutHash = hash.replace(/^#\/?/, '')
  const [pathPart] = withoutHash.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  if (segments.length === 0) return '/'
  return '/' + segments.slice(0, 2).map(safeDecode).join('/')
}

let lastPath: string | null = null

/** Fire a GoatCounter pageview for the current hash. Dedupes consecutive
 * identical paths, and retries (bounded) while the async count.js loads. */
export function trackPageview(attempt = 0): void {
  const path = pathFromHash(window.location.hash)
  if (path === lastPath) return
  const count = window.goatcounter?.count
  if (typeof count !== 'function') {
    // count.js is async; retry for ~3s so the landing pageview isn't lost.
    if (attempt < 20) window.setTimeout(() => trackPageview(attempt + 1), 150)
    return
  }
  lastPath = path
  count({ path, title: document.title })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- analytics` (from `app/`)
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run build` (from `app/`)
Expected: `tsc -b` succeeds (no type errors), vite build completes.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/analytics.ts app/src/lib/analytics.test.ts
git commit -m "feat: hash-aware GoatCounter pageview tracking module"
```

---

### Task 2: Wire tracking into the app + add GoatCounter script

**Files:**
- Modify: `app/index.html` (add GoatCounter settings + script in `<head>`)
- Modify: `app/src/App.tsx` (add a single root effect calling `trackPageview`)

**Interfaces:**
- Consumes: `trackPageview` from `./lib/analytics` (Task 1).
- Produces: live pageview events. No new exported symbols.

Rationale for wiring in `App.tsx` (not `useRoute`): `useRoute` is imported by multiple components (App, Leaderboard, Trends, Compare) as a param-reader; the tracking side-effect must run exactly once, so it belongs in a dedicated effect in the single root component.

- [ ] **Step 1: Add the GoatCounter script to `index.html`**

In `app/index.html`, inside `<head>`, immediately before the closing `</head>` tag (after the Google Fonts `<link>` lines), add:

```html
    <!-- GoatCounter: cookieless analytics. no_onload=true so the SPA controls
         counting (hash routes aren't visible to the default auto-count). -->
    <script>
      window.goatcounter = { no_onload: true }
    </script>
    <script data-goatcounter="https://goat.moviewords.org/count" async src="//gc.zgo.at/count.js"></script>
```

- [ ] **Step 2: Wire `trackPageview` into `App.tsx`**

In `app/src/App.tsx`:

Change the top import line:

```ts
import { useState } from 'react'
```

to:

```ts
import { useEffect, useState } from 'react'
```

Add the analytics import directly below the `useRoute` import (line 2 area):

```ts
import { trackPageview } from './lib/analytics'
```

Inside the `App` component, immediately after `const section = route.path[0] ?? ''`, add:

```ts
  // Fire a GoatCounter pageview on first load and on every hash navigation.
  // Wrapped so the hashchange Event isn't passed as the retry counter.
  useEffect(() => {
    const track = () => trackPageview()
    track()
    window.addEventListener('hashchange', track)
    return () => window.removeEventListener('hashchange', track)
  }, [])
```

- [ ] **Step 3: Typecheck and run existing tests**

Run: `npm run build && npm test` (from `app/`)
Expected: build succeeds; all tests pass (nothing regressed).

- [ ] **Step 4: Manual verification in dev**

Run: `npm run dev` (must be port 5173 — bucket CORS depends on it), open the site, then in DevTools → Network filter `count`.
Expected:
- On load: one request to `goat.moviewords.org/count` (or `moviewords.goatcounter.com/count` if the vanity domain isn't configured yet) with the landing path.
- Click through Trends / a movie / Compare: one new `count` request per section, path matching the grain (`/trends`, `/movie/<id>`, `/compare`).
- No duplicate consecutive counts for the same path.
- After ~1 minute, the GoatCounter dashboard "no data received" message clears.

- [ ] **Step 5: Commit**

```bash
git add app/index.html app/src/App.tsx
git commit -m "feat: fire GoatCounter pageviews on hash navigation"
```

---

### Task 3: Privacy note in FAQ

**Files:**
- Modify: `docs/FAQ.md` (add a Q&A under a new "Privacy" section at the end)

**Interfaces:** none (docs only).

- [ ] **Step 1: Append the privacy Q&A**

At the end of `docs/FAQ.md`, add:

```markdown
## Privacy

### Do you track me? What analytics do you use?

No cookies, no personal data, no cross-site tracking - so there's no consent
banner to click. We use Cloudflare Web Analytics and GoatCounter, both
cookieless: they record aggregate hits (which page, roughly where in the world,
what referred you) with no identifiers that follow you around. That's enough to
see how the site is doing after launch, and nothing more.
```

- [ ] **Step 2: Commit**

```bash
git add docs/FAQ.md
git commit -m "docs: add cookieless-analytics privacy note to FAQ"
```

---

## Manual rollout checklist (owner — external, no code)

These are done in third-party dashboards, not in the repo. Do them around
deploy time.

- [ ] **Cloudflare Web Analytics:** Cloudflare dashboard → `moviewords` Pages project → enable Web Analytics. CF injects the beacon at the edge; confirm hits appear after the next deploy.
- [ ] **GoatCounter vanity domain:** GoatCounter → Settings → Domain settings → Custom domain → enter `goat.moviewords.org`, save. (The DNS-only CNAME already exists.) Wait for propagation + TLS provisioning (can take a few hours). Until then the script falls back to `moviewords.goatcounter.com`.
- [ ] **GoatCounter:** confirm the `moviewords` site shows data once Task 2 is deployed (or verified in dev).
- [ ] **Google Search Console:** add property for `moviewords.org`, verify via DNS TXT (managed in Cloudflare DNS), submit the homepage sitemap. Note: hash routing means GSC sees one URL (`/`) — site-wide data only, expected.

---

## Self-review notes

- **Spec coverage:** CF Web Analytics (rollout checklist), GoatCounter script + `no_onload` (Task 2 Step 1), hash-aware `analytics.ts` + wiring (Tasks 1-2), section+id grain with query-strip (Task 1 tests), unit tests for the pure normalizer (Task 1), privacy note (Task 3), GSC + caveat (rollout checklist). All spec sections map to a task.
- **Out of scope confirmed absent:** no History-API migration, no robots/sitemap authoring beyond the existing homepage, no GA4/PostHog, no engagement events.
- **Type consistency:** `pathFromHash` / `trackPageview` / `window.goatcounter.count({ path, title })` names match across Tasks 1-2.
