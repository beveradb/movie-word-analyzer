# Full i18n localization into 33 languages — 2026-09-15

**Project:** moviewords   **Branch/commit:** main @ 09b3569 (PRs #23 feature + #24 CI, both squash-merged + deployed)   **Status:** done — live on moviewords.org, prod-verified en/ja/ar

## Summary

Localized the entire moviewords UI into **33 languages** with a compact header
language selector and locale auto-detection, adapting the Nomad Karaoke
i18n playbook (`/Users/andrew/Projects/aquarius/docs/archive/2026-08-28-nomadkaraoke-i18n-localization-playbook-reference.md`)
to this Vite/React hash-routing SPA. Built via subagent-driven development
(23-task plan, fresh implementer + reviewer per task), then integrated with the
corpus-language-filter feature that shipped to `main` first, translated all 32
target locales through a Gemini/Vertex pipeline, merged, deployed (manual
wrangler), and verified in production. Design + plan live in
`docs/superpowers/specs/2026-09-14-i18n-localization-design.md` and
`docs/superpowers/plans/2026-09-15-i18n-localization.md`.

Scope decision up front: **runtime UX only, not crawlable SEO** — this is a
hash-routing SPA, so per-locale URLs/hreflang would be an SSR/prerender rewrite
(out of scope). Locale lives in `localStorage`, not the URL.

## What changed

**Runtime (`app/`, dependency-free):**
- `app/src/i18n/locales.json` — single source of truth for the 33 locales
  (`{code,native,english,flag,rtl,intl}`); consumed by BOTH the TS runtime and
  the Python pipeline (kills the playbook's "list duplicated in 4 places" wart).
- `app/src/i18n/index.tsx` — `I18nProvider` + `useI18n()` → `t` (strings,
  `{var}` single-brace), `tn` (rich sentences: substitutes React nodes into
  `{token}` placeholders — never split a sentence into fragment keys), `n`
  (`Intl.NumberFormat`). Fallback active→en→key. `en.json` bundled eagerly;
  other locales lazy `import.meta.glob(['../messages/*.json','!../messages/en.json'])`
  code-split. Detection: `localStorage('mw_locale')` → `navigator.languages`
  prefix → `en`. Request-id guard prevents out-of-order async locale loads;
  `<html lang/dir>` set to the *applied* locale (not the requested one).
- Header `LanguageSelector` (all 33, native+English names, click-outside).
- All UI copy extracted to `app/src/messages/en.json` (321 keys) across ~20
  namespaces; English is the ONLY hand-authored message file.
- RTL for `ar`/`he` via Tailwind logical properties (converted 58 physical
  `ml/mr/pl/pr/left/right/text-left/right/rounded-l/r/border-l/r` → logical).
- Locale-aware numbers via `n()`; 4-digit years/IDs kept raw; percentages via
  `n(ratio,{style:'percent'})`.

**Pipeline (`pipeline/scripts/i18n/`, uv `i18n` dep group = google-genai +
google-cloud-storage):**
- `translate.py` — two-pass Gemini `gemini-3.1-pro-preview` on Vertex (project
  `nomadkaraoke`, location `global`, ADC auth), GCS content-hash cache bucket
  `nomadkaraoke-translation-cache` (shared), delta detection via committed
  `.en-snapshot.json`, glossary `_all` expansion, moviewords voice + " - "
  hyphen rule in the prompt. Pure helpers `should_write_snapshot`/`resolve_mode`
  are unit-tested.
- `validate-translations.py` — key + placeholder + empty-string parity.
- `glossary.json` — protects brand/proper nouns (Movie Words, IMDb, TMDB, OPUS,
  DuckDB, …).
- Automation: `.githooks/pre-commit` auto-translates on staged en.json (uses
  `--group i18n`, branches on the real translate exit status, non-fatal);
  `.github/workflows/i18n.yml` (workflow "i18n", job `translation-check`) runs
  the full validator on PRs touching messages/i18n/pipeline paths — blocking,
  path-filtered.
- `app/package.json`: `npm run translate` / `npm run translate:validate`.

**Translations:** 32 locale files generated two-pass; full validation **32/32,
0 issues**. First full run ~294 keys/locale; the merge added ~40 keys handled by
a delta run.

**Integration with corpus-language-filter (shipped first as PRs #20-22):** that
feature DELETED `corpus.ts` and replaced the two-corpus toggle with a multiselect
language filter (`languages.ts`, `FilterExplainer`/`LocaleFilterHint`/`Modal`).
Merged `origin/main` in, adopted their architecture wholesale, re-applied the
i18n layer, localized their new strings (new namespaces `languageFilter`,
`filterExplainer`, `localeFilterHint`, `modal`), removed the now-dead `corpus.*`
namespace, and wired `languageName(code, locale)` so language names localize via
`Intl.DisplayNames` (no pipeline translation of language names). Delta-translated
the new keys and pruned the retired keys from all 32 locale files.

**Ship:** PR #23 (feature) squash-merged → `c2b2e1c`; PR #24 (CI workflow, split
out) → `09b3569`. Deployed manually: `cd app && npm run build`, source
`/Users/andrew/Projects/beveradb/.envrc` (CLOUDFLARE_API_TOKEN + ACCOUNT_ID),
`npx wrangler pages deploy dist --project-name moviewords --branch main`. Live
bundle `index-W7Qn89mb.js` on moviewords.org.

## Decisions & rationale

- **Custom ~50-line runtime, not next-intl/react-i18next** — next-intl is
  Next-only; a hand-rolled runtime matches this codebase's minimalist ethos and
  keeps `{var}` placeholder syntax identical to the pipeline/validator (zero
  drift), with lazy per-locale code-splitting and zero new runtime deps.
- **`tn` (node interpolation), not sentence-splitting** — splitting prose into
  per-fragment keys breaks word order in most target languages.
- **Two complete sentences over a `{plural}` letter-append** — see gotcha below.
- **MT for v1** — non-commercial project; a slightly flattened tone on stylized
  copy is acceptable (voice actually carried over well: "Fundido de entrada:",
  "Corte brusco a:").
- **Reuse nomadkaraoke GCP project + shared cache bucket** — free credits;
  content-hash cache dedups harmlessly across projects.
- **Full RTL sweep now** — contained (58 classes); avoids shipping two broken
  locales.

## Learnings / gotchas

- **`{plural}` = English morphology leak.** The head-to-head string appended an
  's' to "other" via `t(..., {plural: n>2?'s':''})`. Finnish/Japanese/Thai
  naturally dropped the placeholder → placeholder-parity failure. Fix: two
  complete-sentence keys (`headToHeadIntroPair`/`Many`) selected by count, no
  placeholder. **Run the FULL validator, not `--keys-only`** — key-parity alone
  would not have caught this (the CI job runs full parity for this reason).
- **Translated `<option>` needs an explicit `value={code}`.** An `<option>` with
  no `value` uses its (now-translated) text as the form value, silently breaking
  genre/filter selection in every non-English locale. Caught in Leaderboard +
  Compare.
- **`n()` on displayed numbers only; never on 4-digit years/IDs** (would render
  `1,994`). Percentages: pass the ratio to `n(r,{style:'percent',…})`, not `r*100`.
- **RTL is cheap with logical Tailwind classes** — after the one-time sweep,
  mirroring is automatic; set `dir` on the *applied* locale. Arabic renders
  Arabic-Indic numerals (٢٥٬٥١٥) for free via `Intl.NumberFormat`.
- **Snapshot delta corruption.** A subset `--target es` run must NOT rewrite the
  shared `.en-snapshot.json` (it would starve deltas for untouched locales). The
  pipeline only advances the snapshot on full-coverage successful runs
  (`should_write_snapshot`). Also: a missing per-locale file + existing snapshot
  must force FULL mode, not delta (else it writes a near-empty file).
- **`merge_deep` never deletes keys** — after removing keys from en.json you must
  prune the now-stale keys from the 32 locale files or the validator flags
  "Extra key".
- **`languageName(code, locale)` is `Intl.DisplayNames`-based** → language names
  localize with the UI for free; just pass the active locale at call sites.
- **Deploy is MANUAL** (no Cloudflare Pages git integration; no GH Actions
  deploy). Pushing `main` does NOT deploy — the wrangler push is required.
  Creds are in the PARENT `/Users/andrew/Projects/beveradb/.envrc`
  (CLOUDFLARE_API_TOKEN + ACCOUNT_ID), not the repo. `--branch main` = prod;
  omit it and you get a preview. Verify the live bundle hash matches `app/dist`.
- **Workflow files need `workflow` token scope.** Pushing a branch whose history
  adds `.github/workflows/*.yml` is rejected unless the gh/OAuth token has the
  `workflow` scope. The default `gh` token (repo scope) can't. Fix:
  `gh auth refresh -s workflow --hostname github.com` — an INTERACTIVE device
  flow (enter a code at github.com/login/device); it CANNOT run backgrounded
  (the `!`-prefixed session runner backgrounds it → fails). Workaround used to
  ship without waiting on scope: squash the feature branch into a single commit
  off `origin/main` MINUS the workflow file, ship that, then add the workflow via
  a separate PR once scope is granted.
- **Pre-commit hook pitfalls (fixed):** must pass `--group i18n` (google-genai
  lives only in that uv group — bare `uv run` fails on a fresh clone); and do NOT
  pipe the translate command through `tail` in the `if` (tests tail's exit, not
  the command's — masks failures). Capture to a temp log, branch on the real
  status.
- **Rolldown `INEFFECTIVE_DYNAMIC_IMPORT`** when en.json is both statically
  imported and matched by `import.meta.glob` — silence with a negative glob
  pattern `['../messages/*.json','!../messages/en.json']` (post-glob `delete`
  doesn't clear it; Rolldown analyzes the glob statically).
- **CodeRabbit CLI is SSO-blocked here** — used Superpowers adversarial
  whole-branch review instead; PRs opened without the `@coderabbitai ignore`
  line so the GitHub bot can also review (not a required/ blocking check).

## Open threads & next steps

- **ACTION (Andrew): mark `translation-check` a REQUIRED status check** in `main`
  branch protection (Settings → Branches). It's blocking on the PR but not yet
  gate-enforced.
- **`lib/featured.ts` ~90 curated showcase headlines left English** (v1 gap) —
  English-specific wordplay; needs a dedicated per-locale rewrite pass, not
  literal MT.
- **`entity.notFound` composes a translated `{kind}` noun** into a translated
  sentence — no ICU gender/case (MT limitation, acceptable v1).
- **`LangBadge` original-language name uses `Intl.DisplayNames(['en'])`** — a
  film's original-language label stays English regardless of UI locale (edge
  case, all-films corpus, non-English originals). Could pass the active `intl`.
- **No fake-timers unit test for the async locale-load race** (the request-id
  guard is verified by inspection only).
- Adding a language later: edit `app/src/i18n/locales.json`, run
  `npm run translate`, commit.

## Related docs

- Spec: `docs/superpowers/specs/2026-09-14-i18n-localization-design.md`
- Plan: `docs/superpowers/plans/2026-09-15-i18n-localization.md`
- Reference playbook: `/Users/andrew/Projects/aquarius/docs/archive/2026-08-28-nomadkaraoke-i18n-localization-playbook-reference.md`
- Prior feature this merged onto: `docs/sessions/2026-Q3/2026-09-15-corpus-language-filter.md`
