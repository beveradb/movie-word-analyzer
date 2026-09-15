# Dual corpus shipped: All-films toggle, votes>=300, mislabel fix, trends bake live - 2026-09-14/15

**Project:** moviewords   **Branch/commit:** main @ 85f81da (PRs #12, #14, #15, #16; #13 was the parallel frontend session)   **Status:** done - deployed, data live, verified in fresh browser profiles

## Summary

The site now publishes TWO corpora: **English originals (default, 25,515
films)** and **All films - translated subtitles included (51,624 films)**
under the `all/` bucket prefix, switched by a header toggle (`?c=all` >
localStorage > default). The IMDb vote floor dropped 1000 → 300 for both
(data-driven; see the spec). Along the way this session also fixed the
tt0149624 LOTR-mislabel class of bug systematically, and baked + shipped the
per-word Trends JSONs (the other session's frontend for them was already
live). Full batch rerun on the GCP VM, uploaded to R2, app deployed,
everything verified live.

## What shipped (PRs)

- **#12 (squash 8c0aac3)** - the dual-corpus feature: pipeline `derive
  --corpus en|all` (`original_language` column everywhere, new
  `all/word_year_lang.parquet` for future per-language trends),
  `build_movies_index.py` (replaces README heredoc, adds `lang`),
  superlatives `votes >= 1000` floor, `rebuild_web_data.py --corpus`,
  `stage_trends` bake, mislabel blocklist + `scan_mislabels.py`, app corpus
  registry/toggle/badges, docs. Built via subagent-driven development: 14
  reviewed tasks, 2 whole-branch reviews, all green (89 pytest / 60 vitest).
- **#14** - blocklist entries for 4 adjudicated mislabeled subs (Prince
  Valiant 1997, Talaash 2003, Appleseed 2004, Ikiru - each carried another
  film's subtitle; each keeps its next-best genuine sub).
- **#15** - docs count true-up (25,515 / 51,624).
- **#16** - trend object keys are the RAW word: **the Cloudflare/R2 edge
  percent-decodes the request path once before key lookup**, so
  `don%27t.json`-named objects 404 for `?w=don't`. Found in prod
  verification; keys are now raw words, URLs stay percent-encoded.

## The batch run (VM moviewords-pipeline-tmp)

Fresh IMDb dumps → curate (>=300: 90,829) → index → count (18,292 new
parsed, 33,377 cached, 16 unparseable) → enrich (18,296 new TMDB) →
mislabel scan + adjudication → blocklist → 4 films re-counted → derive x2 →
movies-index x2 → boards/signatures/featured/trends bakes x2 (65,935 en +
103,989 all trend JSONs) → posters (32,842 new; 51,600 total) → rclone to
R2 (ordered `--filter` rules; report.md excluded) → zone purge → deploy.
Wall clock ~4h including reviews and the trend-key fix cycle.

## Mislabel detection (new capability)

`pipeline/scripts/scan_mislabels.py`: films sharing >=8 of their top-30
rare words (DF 2-20) → cosine on full count vectors. **Calibration learned
from the real corpus:** raw-count cosine has a stopword floor - unrelated
films sit ~0.75-0.90, same-film rip variants 0.94-0.99, and only >=0.98
means "same subtitle content". The adjudicator's directory-consensus
threshold (0.8) is therefore too lenient to convict on its own - the
per-file tables are what decide: the victim's own directory siblings sit at
<=0.92 against the shared content while the owner's cluster at 0.94+.
Gray-zone pairs left alone (e.g. Inugami 1976/2006 at 0.949 - a
near-shot-for-shot remake by the same director; Burn!/Hercules/Malala at
0.77-0.90 - just the stopword floor, not duplicates).

## Verified live (fresh profiles, moviewords.org)

- Homepage: 2 data requests (movies-index 25,515 + featured-series), no WASM.
- Toggle → `?c=all` reload; hero "51,624 films - translated subtitles
  included"; localStorage persists; share links reproduce the corpus.
- Search "Amélie" → `translated · French` badge; movie page badge too.
- Trends `?w=don't` in all mode: ONE request,
  `all/json/trend/don%27t.json` → 200. No SQL engine.
- Leaderboards (superlatives clean), Decades, Compare all load in all mode.
- tt0149624 serves Pretty Horses words (horse, ain't), not Frodo.

## Gotchas & learnings (beyond the memory notes)

- **rclone mixed `--include`/`--exclude` order is indeterminate** - rclone
  itself warns. Use ordered `--filter` rules ('+ x', '- *'). Verified
  empirically; upload_r2.sh now encodes this.
- **The R2/Cloudflare edge percent-decodes URL paths before key lookup** -
  object keys must be the decoded form. A double-encoded URL fetches a
  percent-named key (that's how it was diagnosed).
- `pkill -f pattern` over gcloud ssh kills its own session (pattern matches
  the ssh command line) - use `pkill -f "cli[ ]derive"`-style char classes.
- rclone→R2 501 NotImplemented on unchanged files is harmless modtime noise
  but `set -e` scripts survive it only because rclone still exits 0 when
  retries succeed; `--no-update-modtime` avoids it entirely.
- The trends-static-bake handoff spec was never committed to git (untracked
  in the main checkout) - the schema contract lives in the plan Task 17 and
  `rebuild_web_data.py` itself.

## VM retired (added 2026-09-15, same session)

Andrew confirmed neither the i18n work nor flipping the default corpus
needs the pipeline, so the VM was retired: `data/work/` caches (51,671
counts + 51,686 tmdb + parquets) archived as a 554MB tar.zst + sha256 to
the **private R2 bucket `moviewords-pipeline-cache`** (~$0.01/mo,
rclone-check verified), then **moviewords-pipeline-tmp was DELETED** (PR
#18). Recreate-and-restore runbook (fresh cached VM in ~30-45 min):
**docs/PIPELINE-RESTORE.md**. The 34GB OPUS zip was deliberately not
archived - it re-downloads from the public OPUS server and the count
caches pin its zip entries.

## Open threads
- Stale `json/trend/*.json` for words that later drop below threshold are
  never cleaned (additive uploads) - harmless, note for a future manifest
  diff.
- Deferred minors from review: `_vectors` SQL interpolation (internal ids),
  movies-index int-coercion symmetry, blocklist zero-match warning,
  `stage_movies`-style streaming for stage_trends if the vocab grows.
- Future unlocked: per-original-language trends via
  `all/word_year_lang.parquet`; `lang` in `all/json/movies-index.json` for
  a language filter; 33-language i18n (corpus copy is registry-driven).
