# UX Iteration Implementation Plan

> **For agentic workers:** Executed inline (autonomous session) by the planning agent with full
> context; task granularity is coarser than the standard zero-context format for that reason.
> Spec: `docs/superpowers/specs/2026-09-12-ux-iteration-design.md`.

**Goal:** Ship the approved UX iteration — intuitive always-visible word filters backed by
dominant-POS data, five leaderboards, and non-empty Trends/Compare landing pages with richer
comparisons.

**Architecture:** All new data is derived locally from the *published* R2 parquets (no VM):
a new `rebuild_web_data.py` script regenerates `word_meta.parquet` (adds `pos`, `dist`),
`json/leaderboard-default.json`, all `json/movie/*.json` (rows gain `pos`), four new
`json/leaderboards/*.json`, and extends `json/signature/{decades,genres}.json`. Frontend reads
the new fields; data uploads before app deploy (additive, back-compatible).

**Tech Stack:** Python 3.12/uv/duckdb/nltk/wordfreq (pipeline), Vite+React+TS+Tailwind v4
(app), Vitest (new) for unit tests, Playwright (new) for e2e at desktop + mobile viewports,
rclone/wrangler for R2 upload + Pages deploy.

## Global Constraints

- Only derived word counts are published — no subtitle text.
- Site stays fully static; hot paths are pre-baked JSON, WASM only for custom queries.
- New parquet/JSON fields are additive; old clients must keep working during rollout.
- Screenplay aesthetic (Courier Prime, highlighter marks, 2px ink borders) for all new UI.

---

### Task 1: pipeline `word_meta2` — dominant POS + distinctiveness (TDD)
- `src/moviewords_pipeline/word_meta2.py`: `dominant_pos(word) -> str` ('n'/'v'/'a'/'r'/'x';
  WordNet lemma `count()` summed per POS, satellites→'a', tie/zero-count fallback = first
  synset's POS, no synsets → 'x'); `distinctiveness(rate_per_million, zipf) -> float`
  (`log2(rate / 10**(max(zipf,1.0)-3))`, rounded 2dp).
- Tests: `know`→v, `war`→n, `uh`→x, `beautiful`→a; dist formula fixed-point checks.

### Task 2: pipeline `boards.py` — four leaderboard builders (TDD)
- Functions over a duckdb connection with `movies`, `words_by_movie`, `words_by_word`,
  `word_year` views + wordlists:
  - `risers_fallers(con)`: decades 1930–2020, per-decade rate/million; words ≥5k uses,
    present ≥6 decades; score `log2((late+0.1)/(early+0.1))`, early=mean(1930s,40s),
    late=mean(2010s,20s). Top 50 each way, with per-decade rate series.
  - `film_superlatives(con, profanity)`: top 20 chattiest (wpm), vocabulary (unique),
    sweariest (profanity/1k, ≥5k words), repetitive (lowest unique/total, ≥5k words).
  - `one_film_wonders(con)`: total ≥300 and top-film share ≥0.6; top 50 by count.
  - `ubiquity(con)`: top 50 by share of films containing the word.
- Tests on tiny in-memory fixture tables.

### Task 3: pipeline signature extension (TDD)
- `extend_signatures(con, sig: dict, kind) -> dict`: adds `swears_per_1k`,
  `words_per_film`, `unique_words`, `top500` ([word,count]) per entity; keeps existing keys.

### Task 4: `scripts/rebuild_web_data.py` + data run + R2 upload
- Fetch published parquets + signature JSON to `pipeline/webdata/in/` (curl).
- Script stages: `meta` (word_meta.parquet + leaderboard-default.json with
  `[word,count,movies,zipf,classes,pos,dist]` rows), `movies` (streaming re-tag of
  18,761 movie JSONs — rows `[word,value,zipf,classes,pos]`, reusing `derive.log_odds`),
  `boards`, `signatures`. Output tree mirrors R2 layout.
- Upload: rclone R2 remote (S3 creds derived from CF API token per session notes) or
  wrangler fallback; verify with curl spot checks.

### Task 5: frontend filter redesign (+ Vitest setup)
- `WordFilterState = { common: 'interesting'|'all', pos: Set<string> }`; default
  `common:'interesting'`. `passesFilter(row, f, stopwords?)`: interesting hides
  stopword-set ∪ zipf≥5; pos chips include-filter on single `pos` char (missing → 'x';
  legacy rows without pos fall back to first `classes` letter).
- Always-visible bar: `all/nouns/verbs/adjectives/adverbs/names & other` chips +
  `interesting|all words` segmented toggle + explainer caption.
- Leaderboard "hide stopwords" checkbox and Movie "include stopwords" checkbox removed
  (subsumed by the toggle). Unit tests for every combination.

### Task 6: leaderboard tabs
- URL param `b`; tabs: words / shifts / films / wonders / everywhere. New board
  components under `app/src/components/boards/`; data getters + types in `lib/data.ts`.
- Words tab: new `most spoken | most movie-ish` sort (movie-ish = count × max(dist,0)).

### Task 7: trends landing
- Featured chart auto-loaded when no `?w=` (day-rotated curated pairs verified against
  word_year); risers/fallers strip linking to charts + leaderboard tab.

### Task 8: compare upgrades
- Empty state auto-loads day-rotated classic matchup (URL untouched).
- `lib/compare.ts`: head-to-head rate-ratio math (≥3× vs every other entity, ≥30 uses,
  top 10 by ratio) from `top500`/movie top lists — unit tested.
- Stats for all kinds (swears/1k, words/film, vocabulary); films-per-year sparkline for
  decade/genre cards from movies-index.

### Task 9: e2e + ship
- Playwright: desktop (1280×800) + mobile (390×844) walks of all five tabs, every filter
  chip combo sanity (nouns tab ⇒ only n rows), trends/compare non-empty defaults,
  movie page filters. Iterate on UX findings until delightful.
- Ship: /test → /coderabbit → /pr → merge → deploy data-then-app → verify prod.
