# Movie Word Analyzer — trends min-corpus threshold + Lindsay credit — 2026-09-14

**Project:** movie-word-analyzer   **Branch/commit:** main @ daa800f (PR #3)   **Status:** done (live in prod)

## Summary

Andrew asked why the "sword" trend line showed huge usage in the 1910s–20s.
Investigation (DuckDB against the live parquets) proved it was a small-sample
artifact: 1914–1923 have 1–3 films/year with 1k–7k total dialogue words
(silent-era intertitles are ~10x shorter than talkie scripts), so a single
mention — e.g. *Intolerance* (1916) saying "sword" 3 times — charted as
~570 uses/million. Fix: trend charts now hide any year whose whole corpus is
under 100k dialogue words, with a note naming the hidden ranges. Also added a
footer credit for Lindsay Wright (original idea) linking to
https://lindsaywright.design/. Both shipped to prod and verified live.

## What changed

- **`app/src/lib/trends.ts`** (new) — `MIN_YEAR_WORDS = 100_000` (rationale
  comment: 1929 ≈ 66k words/10 films, 1930 ≈ 126k/18 films; every kept year
  has 18+ films) and `formatYearRanges` ("1916, 1922–1923, … 2024"). Split
  from the view so vitest doesn't import duckdb-wasm.
- **`app/src/views/Trends.tsx`** — filters year rows by the threshold, renders
  a muted note under the chart listing hidden ranges, replaces the old
  featured-chart-only `year >= 1930` trim (which left the same artifact on
  user charts), drops `featured` from the effect deps (no longer used in the
  body), rewords the "Not enough data" message.
- **`app/src/lib/trends.test.ts`** (new) — 5 tests incl. a tripwire asserting
  the floor stays between 1929's and 1930's corpus sizes.
- **`app/src/App.tsx`** — footer Credits: "Original idea by my lovely wife
  Lindsay Wright — go see her graphic design portfolio."
- **Deployed**: pulled merged main into main clone, `npm install && npm run
  build` (unpiped), `npx wrangler pages deploy dist --project-name moviewords`
  (env from a local direnv file outside the repo). Verified prod serves the new bundle
  and drove the trends page + footer in a real browser.

## Decisions & rationale

- **Threshold on total corpus words/year (100k), not movie count** — directly
  bounds the per-million noise (one mention moves a rate ≤10/million), and the
  year totals were already computed client-side for normalization.
- **Data-driven trim, not a hardcoded 1930 start** — the *trailing* edge has
  the same artifact: 2024 (2 films, ~11k words) and 2025 (3 films, ~18k) —
  the fake "sword" uptick at the chart's right edge. These years will
  automatically reappear once the pipeline ingests more recent films.
- **Visible note over silent trimming** — lists exact hidden ranges per
  charted words, so the chart isn't quietly lying about coverage.
- **PR opened WITHOUT `@coderabbitai ignore`** — no successful local
  CodeRabbit review ran (see gotchas), so per the workflow rules the bot was
  left free to review. It never did (not installed on this repo).

## Learnings / gotchas

- **Data bucket CORS is origin-allowlisted**: `moviewords-data.beveradb.com`
  only allows `https://moviewords.beveradb.com` and `http://localhost:5173`.
  Local dev/verification MUST use vite's default port 5173 or duckdb-wasm
  XHRs fail with NetworkError.
- **CodeRabbit CLI is now unusable here** — authenticated as the
  work-SSO account and dies with "A workspace SSO session is
  required" (v0.7.6; also note `--plain`/`--type` flags are gone, it's
  `coderabbit review --committed --base main`). Fallback: Superpowers
  code-review subagent (verdict: ready to merge; 2 minor nits fixed).
- **CodeRabbit GitHub bot confirmed absent** — PRs #1–#3 all reviewed by
  subagent only; repo checks are just GitGuardian + WIP.
- **`gh pr merge --delete-branch` from a worktree** fails at the local
  checkout step ("'main' is already used by worktree") AFTER successfully
  merging + deleting the remote branch — check `gh pr view --json state`
  before assuming failure.
- **Root `.playwright-mcp/` artifacts are TRACKED** (from the 2026-09-12
  session) — don't `rm -rf` it during cleanup; restore with
  `git checkout -- .playwright-mcp` if you do.
- **Per-year corpus sizes** (from movies.parquet): 1914–1919 = 1 film/yr;
  1920–1923 = 2–3; 1924–1929 = 7–16; 1930 = 18 films/126k words; 1940s+ =
  40+ films/300k+ words; 2024–2025 = 2–3 films. The remaining left-edge
  "sword" spike (1934–35, ~195/million) is genuine: *The Crusades* (1935,
  38 mentions) + *Blue Steel* (1934, 14).

## Open threads & next steps

- 2024/2025 vanish from trend charts entirely until the corpus grows past
  100k words for those years — expected, but worth remembering when recent
  films get ingested (the trim self-heals).
- Reviewer suggested (optional) extracting the kept/dropped partition logic
  into `lib/trends.ts` for direct unit-testing if the logic ever grows.
- Leaderboard "shifts" board already used 1930–2029 bounds in the pipeline
  (`pipeline/src/moviewords_pipeline/boards.py`) — unchanged, still consistent.

## Related docs

- `docs/sessions/2026-Q3/2026-09-12-footer-ideas-downloads.md` — footer
  structure, GH_TOKEN push workaround, wrangler deploy gotcha.
- `docs/ARCHITECTURE.md` — dataset contract (word_year.parquet unchanged).
