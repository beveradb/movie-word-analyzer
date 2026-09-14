# Homepage & site UX overhaul - 2026-09-14

**Project:** movie-word-analyzer   **Branch:** feat/sess-20260914-1435-homepage-ux-overhaul   **Status:** PR open

## Summary

Full pass over the homepage and site UX from Andrew's 8-point review, aimed at
the under-a-minute, mildly-curious visitor. Spec at
`docs/superpowers/specs/2026-09-14-homepage-ux-overhaul-design.md`.

1. **Hero shows the product.** Two-column hero: pitch + search left, the
   featured trend chart right with ◀/▶ cycling - visible without scrolling.
2. **Clapperboard logo.** Ten candidate marks were designed and rendered on a
   comparison sheet (`docs/superpowers/logo-candidates.html`); Andrew picked
   #6, a clapperboard whose slate is a highlighted line of dialogue. Used as
   favicon, header mark, and regenerated apple-touch-icon.
3. **Hero copy rewrite** (Andrew picked from four options): live film/word
   counts from the movie index, plus three clickable hooks ('awesome' vs
   'swell' → Trends, sweariest script → superlatives, Alien vs Aliens →
   Compare).
4. **`#/decades` index page** with hand-drawn era motifs (megaphone, atomic-age
   TV, vinyl, boombox, brick phone...), taglines, film counts; "Decades" in the
   header nav; the homepage decade chips became a banner card.
5. **Leaderboard opens on an Overview tab**: top-5 tasters of all boards
   (risers, fallers, 4 superlatives, interesting adjectives, one-film wonders,
   said-by-every-film), each deep-linking to its tab. Adjectives card links
   `?b=words&pos=a` - WordsBoard now seeds its part-of-speech filter from the
   URL.
6. **Theme toggle** gained sun/moon icons.
7. **Compare featured matchups cycle** with ◀/▶ + "N of M", like Trends.
8. **Featured pools: 6 → 61 trends, 3 → 67 matchups**, all in
   `app/src/lib/featured.ts`. Every trend word was verified against
   `word_year.parquet` (early/mid/late rates per million, so each title's claim
   is true); every matchup movie id verified against `movies-index.json` AND
   its `json/movie/*.json` checked live (the corpus lacks e.g. Goodfellas,
   Casablanca, Barbie 2023 - nothing unverified shipped).
9. **Copy style**: em-dash separators normalized to " - " across UI strings.

Cleanups from the pre-PR review: shared `FeaturedNav` + `SeriesLegend`
components (were 3 hand-synced copies), featured-chart failure keeps the
stepper visible, one `DEFAULT_TAB` constant, consistent film-count fallbacks,
word total computed from the index instead of a frozen literal.

## Merge with pre-HN hardening (PR #6)

Another session shipped launch hardening mid-flight; merged `origin/main` in:

- Hero chart now uses main's **pre-baked `loadFeaturedSeries`** (no SQL engine
  on the homepage), falling back to live DuckDB for unbaked words.
- **`pipeline/scripts/rebuild_web_data.py` `stage_featured` now parses the
  FEATURED words out of `featured.ts`** (160 words) instead of a hand-synced
  14-word list. ⚠️ The bake + R2 upload must be re-run for the new trends to
  be engine-free; until then they fall back to DuckDB gracefully.
- Kept main's debounced year inputs, FAQ links, og/touch meta.

## Ideas not done (candidates for later)

- Deep-linkable featured matchups/trends (stepping is local state; copying the
  URL shares today's default, not the stepped one).
- Day-rotation index is frozen at mount - a tab left open across midnight
  keeps yesterday's featured item until reload.
- og.png says "98 million words" (from main); index sums to ~127M - worth
  regenerating og.png text sometime.

## Verification

- 49 unit tests pass (featured pool shape/dedup/copy-style tests added);
  `tsc -b && vite build` clean. Lint has pre-existing failures identical on
  main (LineChart conditional hooks) - not introduced here.
- Clicked through home/decades/leaderboard/compare/trends at desktop + mobile
  widths, light + dark, via Playwright against `vite --port 5173`.
- All 85 matchup movie JSONs curl-checked 200 on the live bucket.
