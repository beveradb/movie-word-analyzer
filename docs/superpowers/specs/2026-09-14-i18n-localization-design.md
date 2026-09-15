# Full localization of moviewords into 33 languages — design

**Date:** 2026-09-14
**Status:** approved (brainstorm), pending implementation plan
**Reference:** `/Users/andrew/Projects/aquarius/docs/archive/2026-08-28-nomadkaraoke-i18n-localization-playbook-reference.md`

## Goal

Make the whole moviewords UI available in 33 languages, with a compact language
selector in the header and locale auto-detection for new visitors. Every
user-facing string is authored once in English; the other 32 locales are
machine-translated (Gemini on Vertex AI, via the `nomadkaraoke` GCP project) and
are safe to overwrite.

**Scope decision — runtime UX only, not SEO.** moviewords is a client-rendered
Vite SPA with hash routing (`#/trends?w=…`); crawlers only ever see the English
shell and hash fragments never reach the server. So this project localizes the
*visitor experience* entirely client-side. It does **not** attempt crawlable
per-locale URLs, hreflang, or per-locale sitemaps (that would require a
prerender/SSR rewrite and is explicitly out of scope). Locale state lives in
`localStorage`, not the URL.

## Non-goals

- Server-rendered / prerendered per-locale HTML, hreflang, per-locale sitemaps.
- Translating source data: movie titles, dialogue word tokens, person/entity
  names. These stay as-is.
- Localizing the Python pipeline output data or the `docs/` prose.
- Human translation / TMS. Machine translation only; a slightly
  simplified/flattened tone on the stylized "film-script" phrasing is accepted
  for v1.

## Mental model

Two halves meeting at `app/src/messages/{locale}.json`:

```
AUTHOR TIME (edit en.json only)              RUN TIME (visitor browser)
app/src/messages/en.json  ── source of truth  I18nProvider loads messages/{locale}.json
   │                                             useT() → t('view.key', { vars })
   ▼ git commit → pre-commit hook                useLocale() / setLocale()
translate.py → Gemini (Vertex, nomadkaraoke)     header LanguageSelector + auto-detect
   │  ▲ GCS content-hash cache (skip repeats)     <html lang/dir>  (rtl for ar/he)
   ▼  │
messages/{es,de,…}.json + .en-snapshot.json
   │
   ▼  CI: validate-translations.py (key-parity gate, blocking)
```

Core discipline: **only English is hand-authored.** The moment a non-`en` file
is hand-edited, "edit one string → 32 translations appear" breaks.

## The 33 languages

Same set as the reference playbook §2: `en` (source) + 32 targets — `es de pt fr
ja ko zh it nl pl tr ru th id vi tl hi ar sv nb da fi cs ro hu el he ms uk hr sk
ca`. RTL: `ar`, `he`.

## Component design

### Runtime layer (`app/`)

Custom, dependency-free React i18n runtime (~50 lines) matching the codebase's
hand-rolled ethos (cf. the 12-line `src/lib/route.ts`).

**`app/src/i18n/locales.json`** — the *single source of truth* for the locale
table. Array of records:

```json
[
  { "code": "en", "native": "English", "english": "English", "flag": "🇬🇧", "rtl": false, "intl": "en-US" },
  { "code": "ar", "native": "العربية", "english": "Arabic",  "flag": "🇸🇦", "rtl": true,  "intl": "ar-SA" }
]
```

- TypeScript imports it directly (selector, detection, provider).
- The Python pipeline reads the **same file** for its target list and RTL set.

This eliminates the reference's biggest wart (the locale list duplicated across
`routing.ts`, `LOCALE_NAMES`, `LOCALE_INFO`, `worker.js`). Adding a language =
edit `locales.json` + run the pipeline.

**`app/src/i18n/index.tsx`** — `I18nProvider` + hooks:

- `useT()` returns `t(key, vars?)`: dotted-key lookup, `{var}` single-brace
  interpolation (identical placeholder syntax to the pipeline and validator —
  zero drift). Missing key → English string → the key itself (never blank).
- `n(value, opts?)` — locale-aware number formatting via
  `Intl.NumberFormat(activeIntlTag)`. e.g. `25,515` → `25.515` (de) / `25 515`
  (fr). The `120×` multiplier keeps `×`, formats its number.
- `useLocale()` / `setLocale(code)`.
- `en.json` is bundled eagerly (instant first paint + fallback source). The
  active non-English locale is loaded via dynamic `import()` so Vite
  code-splits each of the 32 into its own chunk; only one is ever fetched.
- On `setLocale`: persist `localStorage('mw_locale')`, set
  `document.documentElement.lang` and `dir` (`rtl` for `ar`/`he`).

**Detection (first load)**, mirroring the playbook's root-redirect logic:
`localStorage('mw_locale')` → first `navigator.languages` prefix that matches a
known code → `'en'`.

**`app/src/components/LanguageSelector.tsx`** — compact header control styled
like the existing `ThemeToggle` / `CorpusToggle` (`border-2 border-ink
font-script`): a button showing globe/flag + current native name, opening a
click-outside dropdown listing all 33 (native + English names, current one
marked). Uses RTL-safe logical classes (`end-*`, `ms-auto`).

### String extraction

Walk all 15 UI files (~3000 lines). Move every user-facing string into
`en.json`, namespaced by view/component: `nav.*`, `home.*`, `genres.*`,
`decades.*`, `trends.*`, `movie.*`, `leaderboard.*`, `compare.*`, `entity.*`,
`chart.*`, `errors.*`, `corpus.*`, `languageSwitcher.*`. Convention: one
top-level namespace per view/component; leaf keys referenced via
`useT()`.

**Translate:** UI chrome, headings, explanatory prose, buttons, chart
labels/axes, error and empty states, the stylized microcopy ("Smash cut to:",
"Day shoot" / "Night shoot"), and the fixed data vocabularies that are really UI
labels — **genre names** (Action→Acción), **part-of-speech tags** (noun/verb),
**decade/era labels**, **corpus names**.

**Do not translate (source data):** movie titles, dialogue word tokens,
person/entity names. Route all displayed numbers through `n()`.

### RTL (`ar`, `he`)

Set `dir="rtl"` on `<html>` for RTL locales, then a one-time sweep converting the
~58 physical directional Tailwind classes to logical properties:

| Physical | Logical |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `rounded-l*` / `rounded-r*` | `rounded-s*` / `rounded-e*` |
| `border-l*` / `border-r*` | `border-s*` / `border-e*` |
| `left-*` / `right-*` | `start-*` / `end-*` |

After the sweep, RTL is automatic — no per-component RTL code.

### Pipeline layer (`pipeline/scripts/i18n/`, `uv`-managed)

Near-verbatim port of playbook §6–9:

- `translate.py` — two-pass (translate → review) Gemini translation with delta
  detection (`.en-snapshot.json`), GCS content-hash cache, `asyncio` concurrency,
  retries. CLI flags per §6.5 (`--messages-dir`, `--target`, `--full`,
  `--skip-review`, `--no-cache`, `--dry-run`, `--cache-bucket`).
- `translation_cache.py` — GCS cache keyed by `sha256(english)[:16]` per locale
  (playbook §7). Must sit beside `translate.py`.
- `validate-translations.py` — key-parity + placeholder + empty-string + JSON
  validity gate (playbook §9). `--keys-only` for CI.
- `glossary.json` — do-not-translate / forced terms.

**Config:**
- Model: current Gemini Pro on **Vertex AI** (exact model id confirmed at
  implementation; reference used `gemini-3.1-pro-preview`). `temperature=0.3`,
  medium thinking.
- `PROJECT = "nomadkaraoke"`, `LOCATION = "global"`, ADC auth (minted token /
  `gcloud auth application-default login`). No API key.
- Cache bucket: reuse the shared `nomadkaraoke-translation-cache` (keyed by
  english-hash per locale — moviewords strings dedup in harmlessly; that's where
  the GCP project/credits already are).
- Target list + RTL set read from `app/src/i18n/locales.json`.
- Placeholders: `{var}` single-brace (matches validator regex `\{(\w+)\}`).
- Output: `json.dump(..., ensure_ascii=False, indent=2)` + trailing newline.

**Prompt context + glossary:**
- Product context describes moviewords (a site exploring the words spoken in
  films, log-odds distinctive-word analysis over the OpenSubtitles corpus) and
  its playful film-script voice; instruct a natural, friendly register.
- Enforce the **" - " hyphen house style** (spaced hyphen, never em-dashes;
  en-dash year ranges OK) — matches project copy convention.
- Glossary protects proper nouns (keep untranslated): **Movie Words**,
  **moviewords.org**, **IMDb**, **TMDB**, **OpenSubtitles**, **OPUS**,
  **DuckDB**, **The Big Lebowski** and other film titles appearing in copy.

**Dependencies:** add `google-genai` + `google-cloud-storage` as a `uv`
dependency group in `pipeline/pyproject.toml`. Expose `npm run translate` /
`npm run translate:validate` wrappers from `app/` for convenience.

### Automation & enforcement

- **`.githooks/pre-commit`** — when staged `app/src/messages/en.json` changes:
  run the pipeline (`--target all --skip-review`), then `git add` the
  regenerated locale files so they land in the same commit. **Non-fatal** if GCP
  auth is missing locally (guarded, so `set -e` doesn't abort) — CI backstops.
  Enable per-repo with `git config core.hooksPath .githooks`.
- **`.github/workflows/i18n.yml`** — net-new, tiny. On PRs touching
  `app/src/messages/**`, run `validate-translations.py --keys-only`.
  **Blocking.** Independent of the Cloudflare Pages git-deploy (which is
  unaffected).

### Testing

- **Vitest** (matches existing `src/**/*.test.ts` style):
  - `t()` interpolation + missing-key fallback (→ English → key).
  - `n()` number formatting differs correctly across a few locales.
  - Detection precedence: localStorage → navigator.languages → default.
  - `setLocale` sets `document.documentElement.lang` and `dir`.
- **Python** `pipeline/tests/`: port the cache unit tests (hit/miss, hash
  keying) and a validator test (detects missing key / dropped placeholder).
- **Manual:** production build, switch through several languages including one
  RTL (`ar`), confirm zero missing-key fallbacks in the console and correct
  mirroring.

### Docs & policy

Add an "Internationalization" section to `app/README.md` and `CLAUDE.md`:
*never hardcode user-facing strings; edit `en.json` only; commit and the rest is
automatic (pre-commit hook translates, CI validates).* Document
`git config core.hooksPath .githooks` and the manual `npm run translate` escape
hatch.

## Key decisions & rationale

1. **Runtime UX only, no SEO** — the app is a hash-routing SPA; crawlable
   per-locale URLs would be an SSR/prerender rewrite, out of scope.
2. **Custom `t()` runtime, not next-intl/react-i18next** — next-intl is
   Next-only; a ~50-line custom runtime matches the codebase's minimalist,
   dependency-light ethos and keeps `{var}` placeholder syntax identical to the
   pipeline/validator (zero config drift), with lazy per-locale code-splitting.
3. **Single `locales.json` source of truth** — deliberately fixes the
   reference's known "list duplicated in 4 places" wart.
4. **Reuse the `nomadkaraoke` GCP project + shared cache bucket** — free
   credits + content-hash cache dedups across projects harmlessly.
5. **Machine translation for v1** — non-commercial project; a slightly
   flattened tone on stylized phrasing is acceptable. Two-pass review for batch
   quality; spot-fix hero strings later if any read flat.
6. **Full RTL sweep now** — the ~58-class conversion is contained; better than
   shipping two visibly-broken locales.
7. **Pre-commit hook + blocking CI gate** — "edit English only, translations
   appear," verified structurally by CI.

## Risks & mitigations

- **Voice flattening under MT** — mitigated by product-context prompt, glossary,
  two-pass review; accepted for v1, hero strings spot-fixable later.
- **RTL regressions from the class sweep** — covered by manual `ar` verification
  and the contained scope.
- **First-load payload** — mitigated: `en.json` bundled, other locales
  lazy-loaded and code-split (one fetched at most). Consistent with the app's
  existing payload sensitivity.
- **GCP auth friction locally** — pre-commit hook is non-fatal; CI is the
  backstop.
