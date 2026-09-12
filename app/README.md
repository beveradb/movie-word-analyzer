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
