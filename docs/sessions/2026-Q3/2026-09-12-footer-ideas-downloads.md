# Movie Word Analyzer — footer: dataset downloads, idea inbox, socials — 2026-09-12

**Project:** movie-word-analyzer   **Branch/commit:** main @ 5da327f (PR #2)   **Status:** done (live in prod)

## Summary

Small footer iteration from Andrew's ask: let visitors suggest analysis ideas
and download the dataset for their own experiments. Plus (mid-session ask)
GitHub/LinkedIn/Instagram profile links. Shipped to prod and verified live.

## What changed

- **`app/src/App.tsx` footer**, three new screenplay-styled sections:
  - **Take the data.** — direct links to the five published parquets
    (movies 0.8 MB, words_by_movie 88 MB, words_by_word 93 MB, word_year
    6 MB, word_meta 3.5 MB) with one-line descriptions, a copy-pasteable
    `duckdb -c "… FROM 'https://moviewords-data…/movies.parquet' …"` example,
    dataset-contract schema link, CC BY-NC-SA 4.0 license link. URLs built
    from `DATA_BASE` so `VITE_DATA_BASE` overrides still work.
  - **Got an idea?** — `mailto:andrew@beveridge.uk?subject=Movie%20Words%20idea`.
  - **Credits.** — github.com/beveradb · linkedin.com/in/andrewbeveridge ·
    instagram.com/beveradb.
- **`README.md`** — matching "Download the data" section (table + DuckDB
  one-liner + idea email).

## Gotchas / lessons

- **Git pushes from this repo hit the wrong GitHub account** (a work account
  from the macOS keychain credential helper). Fix: eval the `GH_TOKEN` export
  from a local direnv file outside the repo, then push with
  `git -c 'credential.helper=!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f' push …`.
  `gh` CLI works with the same eval'd `GH_TOKEN`.
- **Don't pipe `npm run build` through `tail` in a `&&` chain before deploying**
  — the pipe masked a tsc failure (main clone was missing dev deps) and
  wrangler deployed a stale `dist`. Recovered by deploying the worktree's
  verified dist; main clone's node_modules now repaired (`npm install`).
- CodeRabbit GitHub bot never reviewed PR #2 (~9 min wait, no comments) —
  likely not installed on this repo; PR #1's review was also subagent-based.
  Checks present: GitGuardian + WIP only.
- `gh pr merge --delete-branch` errors with "'main' is already used by
  worktree" when run from a linked worktree, but the **merge itself succeeds**
  — check `gh pr view --json state` before retrying.

## Verification

- 17/17 vitest, clean build; lint failures pre-existing (LineChart hooks etc).
- Playwright at desktop + 375px, light + dark, via `vite preview` :4173.
- Prod: moviewords.beveradb.com serves new bundle; footer sections FADE OUT /
  TAKE THE DATA / GOT AN IDEA? / CREDITS all present; parquet HEAD → 200;
  social + mailto hrefs verified in DOM.
