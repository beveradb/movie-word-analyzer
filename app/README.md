# Movie Words — frontend

Static SPA: Vite + React 19 + TypeScript + Tailwind v4 + DuckDB-WASM.
No backend — all data comes from the public dataset bucket.

## Develop

```bash
npm install
npm run dev            # uses the production dataset by default
VITE_DATA_BASE=http://localhost:8787 npm run dev   # or point at your own data host
```

The data host must serve the dataset-contract files (see
`../docs/ARCHITECTURE.md`) with CORS allowing your origin and HTTP range
requests enabled (any S3-compatible/static host qualifies).

## Deploy

```bash
npm run build
wrangler pages deploy dist --project-name moviewords --branch main
```

Cloudflare credentials come from the environment (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`).

## How it's put together

- `src/lib/data.ts` — dataset base URL + typed fetchers for the JSON hot paths
  (cached in-memory).
- `src/lib/duck.ts` — lazy DuckDB-WASM singleton (jsDelivr bundles, web
  worker); `q(sql)` returns plain JS rows; `pq(name)` builds
  `read_parquet('<DATA_BASE>/…')` fragments. Queries hit R2 Parquet directly
  via HTTP range requests — the two sort orders of the word-count parquets are
  what make this fast; don't break them.
- `src/lib/route.ts` — tiny hash router (`#/movie/:id`, `#/trends?w=…`,
  `#/leaderboard`, `#/compare?e=…`, `#/decade/:d`, `#/genre/:g`).
- `src/views/` — one file per view. Compare's entity encoding: movie ids
  verbatim, `d:1980`, `g:Crime`.
- `src/components/` — `ui.tsx` (Slug, HighlightWord — the signature
  highlighter-mark element, Poster with script-cover fallback, MovieSearch),
  `LineChart.tsx` (SVG, crosshair + tooltip), `WordFilter.tsx` (Zipf
  commonness + POS class filters), `motifs.tsx` (genre/decade SVG art).

## Design system

Screenplay aesthetic: Courier Prime display, paper/ink token palette defined in
`src/index.css` under `@theme`, dark mode is a token flip on `.dark` (set
pre-paint in `index.html`, persisted to localStorage). Chart series colors are
CVD-validated per surface (see `docs/ARCHITECTURE.md` § decisions); if you
change them, re-run a palette validator rather than eyeballing. Anything
rendered on a solid `bg-mark` (highlighter yellow) must keep dark ink — there's
a global dark-mode rule enforcing this.

## Internationalization (i18n)

**English-only authoring.** All UI strings are written once, in English, and
never hardcoded elsewhere. Add new copy to `src/messages/en.json` under the
appropriate namespace, then render it via the `useI18n()` hook's `t` / `tn` /
`n` helpers - don't inline literal strings in components or views.

- `t(key, vars?)` - returns a plain interpolated string (`{var}` placeholders).
- `tn(key, vars)` - same, but lets `{var}` values be React nodes (for rich
  sentences containing links, `<HighlightWord>`, etc.), returning an array of
  nodes instead of a string.
- `n(value, options?)` - locale-aware number formatting via `Intl.NumberFormat`.

`en.json` is the single source of truth for source copy. The other 32
locales in `src/messages/*.json` are machine-translated from it - do not hand
edit them; any manual change will be overwritten by the next translation run.

The supported languages, native/English names, flags, RTL flag, and `Intl`
locale tag all live in one place: `src/i18n/locales.json`. Both the TypeScript
runtime and the Python pipeline read this same file, so it's the single
source of truth for "which languages exist."

RTL languages (Arabic, Hebrew) need no per-component work - the layout uses
Tailwind logical properties (`ps-*`/`pe-*`/`ms-*`/`me-*` etc. instead of
`pl-*`/`pr-*`/`ml-*`/`mr-*`), so direction flips automatically off the
`dir="rtl"` attribute set on `<html>`.

### Adding a language

1. Add an entry to `src/i18n/locales.json` (code, native name, English name,
   flag, `rtl`, `intl` tag).
2. Run the translation pipeline (see below) to generate the new
   `src/messages/<code>.json` file from `en.json`.

### Translation pipeline

Translation is automated, not manual:

- **On commit** - a pre-commit hook (`.githooks/pre-commit`) detects a staged
  change to `app/src/messages/en.json`, re-runs the pipeline for the changed
  keys, and stages the regenerated locale files alongside your commit. Enable
  it once per clone with:

  ```bash
  git config core.hooksPath .githooks
  ```

- **In CI** - `.github/workflows/i18n.yml` runs a blocking key-parity check on
  every PR that touches `app/src/messages/**`, `app/src/i18n/**`, or
  `pipeline/scripts/i18n/**`, failing the build if any locale is missing or
  has extra keys relative to `en.json`.
- **Manually** - from `app/`:

  ```bash
  npm run translate            # regenerate all 32 non-English locales
  npm run translate:validate   # check key parity only, no API calls
  ```

Translation runs on Gemini via Vertex AI (GCP project `nomadkaraoke`),
authenticated with Application Default Credentials - run
`gcloud auth application-default login` once if `npm run translate` reports
an auth error. `npm run translate:validate` is stdlib-only and needs no GCP
credentials.
