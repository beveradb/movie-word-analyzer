# Corpus language filter: all-films default, multiselect language filter, explainer — 2026-09-15

**Project:** moviewords   **Branch/commit:** main @ fb3bf5e (PRs #20, #21, #22 all squash-merged + deployed)   **Status:** done — live on moviewords.org, verified in prod

## Summary

One long session that took the corpus control from a two-button English/All
toggle to a full **multiselect original-language filter** over 34 languages,
with honest framing about what it measures. Three ships:

1. **PR #20** — converted the `ENGLISH | ALL FILMS` toggle to a dropdown and
   flipped the **default corpus to All Films**.
2. **PR #21** — the big one: designed + built (spec → 2 plans → 16-task
   subagent-driven execution) a **per-language data bake + client-side merge**
   so every feature filters by a film's original language. Baked 34 languages
   to R2, shipped the frontend, verified live.
3. **PR #22** — a **filter explainer** (modal + inline cues) clarifying that the
   filter selects by *original language* while all word counts come from the
   *English subtitles* (translations for non-English films).

## What changed

### PR #20 — dropdown + all-films default
- `app/src/lib/corpus.ts`: `resolveCorpus` defaults to `all`; `switchCorpus`
  treats `all` as the clean-URL default. `App.tsx`: `CorpusToggle` → single-select
  `CorpusDropdown` (globe trigger, checked menu, outside-click/Escape close).

### PR #21 — corpus language filter (multiselect by original language)
- **Design docs:** `docs/superpowers/specs/2026-09-14-corpus-language-filter-design.md`
  + two plans (`2026-09-15-corpus-language-filter-{pipeline,frontend}.md`).
- **Decisions:** offer the **35 languages with ≥100 films** as **34 options**
  (`cn`+`zh` merged into "Chinese"); **per-language bake + client-side merge**
  (single language exact, trends exact, aggregated top-K head-accurate);
  data-driven degradation with honest "based on N films" labels; **batch Apply →
  one reload** (`?langs=es,fr`); default = All films.
- **Pipeline** (reuses the existing bake): `build_signature_base` extracted from
  `derive.py`; `build_lang_slice.py` filters the published `all/` parquets to one
  language and re-derives its `word_year` from `all/word_year_lang.parquet`;
  `rebuild_web_data.py --lang` runs the stages into `all/lang/<code>/`;
  `build_languages_manifest.py` → `all/json/languages.json`;
  `bake_all_languages.py` drives all 34. Per-movie JSON stays global.
  `log_odds` gained a zero-denominator guard.
- **Frontend:** `languages.ts` (state: `?langs=` → stored → []; `?c=` back-compat),
  `logOdds.ts` (TS port, mirrors the guard), `merge.ts` (client-side slice merge),
  language-aware `data.ts`/`series.ts` (`fetchLangMerged`, `getFilteredMovieIndex`,
  per-language trends/featured, engine-query `langFilterSql`), multiselect
  dropdown, honest labels + degradation, locale opt-in hint. `corpus.ts` deleted.
- **Ran the real bake:** mirrored `all/` inputs, baked 34 languages (~315k
  per-language trend JSONs, 1.4G), published to R2 (derived R2 S3 creds from
  `CLOUDFLARE_API_TOKEN` per PIPELINE-RESTORE.md), edge purged.
- Final whole-branch review (opus) → merged with fixes (merged-board dedup for
  shifts/wonders, ubiquity share, engine-fallback denominator, dropdown
  set-compare). Verified live: es exact (1,929), es+fr merge (5,625).

### PR #22 — filter explainer
- `Modal.tsx` (accessible dialog) + `FilterExplainer.tsx` (`ExplainerLink`,
  link/badge variants) explaining original-language-vs-English-subtitle-words.
- Triggers: dropdown "How does this work?" link; inline "…measured from their
  English subtitles" clarifier on filtered Home/Leaderboard/Trends labels; the
  now-clickable `LangBadge` on non-English movie pages.

## Decisions & rationale

- **Bake per-language, merge client-side** — the filter is a union of films and
  most metrics are sums, so one slice per language + client merge gives true
  multiselect with no combinatorial bake, no 35 MB engine, ~$0 (matches the
  static-JSON pattern). Single-language selections are exact.
- **34 options (Chinese merged), ≥100-film floor** — covers 98% of the corpus
  while keeping every selectable language robust enough for its own boards.
- **Explainer over relabeling** — keep "Spanish" etc.; a modal + inline cue carry
  the nuance that counts come from English subtitles.

## Learnings / gotchas

- **We only have ENGLISH subtitles.** The pipeline ingests only OPUS `raw/en.zip`
  (`config.py:9`, `corpus_index.py:11`). So for a non-English film, word counts
  are its **English translation**, never the original dialogue. Original-language
  words are obtainable from OPUS per-language tracks but need a big pipeline
  re-run (VM deleted) — out of scope. This is *why* the explainer exists.
- **fetch_published.sh needed `word_year_lang.parquet`** (all corpus only) for the
  bake; and `build_slice` must read `words_by_movie.parquet` **flat** (fetch
  flattens the R2 `words_by_movie/data.parquet`) — test fixtures had used the
  subdir layout and hid the mismatch. Both fixed pre-bake.
- **upload_r2.sh rclone filters are root-anchored:** per-language
  `all/lang/*/json/trend/**` + `year-totals.json` need their OWN rules or they're
  silently dropped (not just mis-cached).
- **R2 S3 creds** = access key id from `GET /user/tokens/verify`, secret =
  sha256 of `CLOUDFLARE_API_TOKEN` (macOS: `shasum -a 256`); endpoint
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Bump `RCLONE_TRANSFERS` for the
  315k-file upload (~30s at 64).
- **Live `movies-index.json` already carries `lang`**, so client-side language
  filtering of the movie list works without a re-bake.

## Open threads & next steps

- **Parallel i18n-localization session:** main now has my `App.tsx`,
  `Home/Trends/Leaderboard/Decades/Genres/Entity.tsx`, `ui.tsx` changes and
  **`corpus.ts` is deleted** — expect conflicts when that session rebases onto
  the new main.
- **Original-language words** would be a large follow-up (ingest OPUS
  `raw/<lang>.zip` per language; VM was deleted, caches archived to private R2 —
  see PIPELINE-RESTORE.md).
- Minor documented caveats: multi-language *trends* aren't perfectly exact for
  words that only clear the ≥20 floor after summing across languages (per-language
  floor applied pre-merge); engine-fallback denominator is language-scoped but
  uncached (near-unreachable path).
- Entity/Decades/Genres views show per-card counts but no corpus-level "based on
  N films" clarifier line — the dropdown link + badge still cover them; could add
  later.

## Related docs

- `docs/superpowers/specs/2026-09-14-corpus-language-filter-design.md`
- `docs/superpowers/plans/2026-09-15-corpus-language-filter-{pipeline,frontend}.md`
- `docs/superpowers/specs/2026-09-15-filter-explainer-design.md`
- `docs/PIPELINE-RESTORE.md` (R2 creds derivation, VM restore)
- Memory: `moviewords-status` (updated this session with the language-filter state)
