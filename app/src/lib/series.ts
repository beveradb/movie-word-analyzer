import { dataUrl, fetchJSON } from './data'
import { lit, pq, q } from './duck'
import {
  groupTopMovies,
  toSeries,
  trendByYear,
  trendTopFilms,
  trendYearRows,
  wordKey,
  type TopFilm,
  type TrendFile,
  type WordSeries,
  type YearRow,
  type YearTopMovie,
} from './trends'

let yearTotalsCache: Map<number, number> | null = null

/** Whole-corpus word total per release year, cached for the session. */
export async function yearTotals(): Promise<Map<number, number>> {
  if (yearTotalsCache) return yearTotalsCache
  const rows = await q<{ year: number; total: number }>(
    `SELECT year, SUM(count)::DOUBLE AS total FROM ${pq('word_year.parquet')} GROUP BY year`,
  )
  yearTotalsCache = new Map(rows.map((r) => [r.year, r.total]))
  return yearTotalsCache
}

/** Load per-year usage rates for the given words and shape them into chart
 * series. Reads only word_year.parquet (small) - no top-movie join. */
export async function loadWordSeries(words: string[], colors: string[]): Promise<WordSeries> {
  const [rows, totals] = await Promise.all([
    q<YearRow>(
      `SELECT word, year, count::DOUBLE AS count FROM ${pq('word_year.parquet')}
       WHERE word IN (${words.map(lit).join(',')}) ORDER BY word, year`,
    ),
    yearTotals(),
  ])
  return toSeries(rows, totals, words, colors)
}

interface FeaturedSeriesFile {
  totals: Record<string, number>
  words: Record<string, [number, number][]>
}

/** Featured-chart data from the pre-baked JSON (a few KB), so the homepage
 * never pays for the SQL engine. Any word missing from the bake (stale file,
 * fetch failure) falls back to the live DuckDB path. */
export async function loadFeaturedSeries(words: string[], colors: string[]): Promise<WordSeries> {
  try {
    const baked = await fetchJSON<FeaturedSeriesFile>('json/featured-series.json')
    if (words.every((w) => baked.words[w])) {
      const totals = new Map(Object.entries(baked.totals).map(([y, t]) => [Number(y), t]))
      const rows: YearRow[] = words.flatMap((w) =>
        baked.words[w].map(([year, count]) => ({ word: w, year, count })),
      )
      return toSeries(rows, totals, words, colors)
    }
  } catch {
    // fall through to the engine
  }
  // visible breadcrumb: this fallback quietly costs the visitor the whole
  // engine download, so a stale/missing bake should never go unnoticed
  console.warn(`featured-series.json bake missing [${words.join(', ')}] - falling back to the SQL engine`)
  return loadWordSeries(words, colors)
}

/** Everything the Trends view needs for a set of words: the chart series, the
 * "films that say it most" table, and the top-movie-per-year notes/table. */
export interface TrendsData {
  wordSeries: WordSeries
  topFilms: Map<string, TopFilm[]>
  topMovies: Map<string, Map<number, YearTopMovie>>
  /** false when we fell back to the live SQL engine (stale/missing bake). */
  baked: boolean
}

let yearTotalsBakeCache: Map<number, number> | null = null

/** Whole-corpus year totals from the pre-baked JSON (a couple of KB), cached
 * for the session. This is the rate denominator shared by every word. */
async function bakedYearTotals(): Promise<Map<number, number>> {
  if (yearTotalsBakeCache) return yearTotalsBakeCache
  const obj = await fetchJSON<Record<string, number>>('json/year-totals.json')
  yearTotalsBakeCache = new Map(Object.entries(obj).map(([y, t]) => [Number(y), t]))
  return yearTotalsBakeCache
}

/** A single word's baked trend file, or null on 404 (the word isn't in the
 * baked corpus, i.e. below the eligibility threshold = "not enough data"). Any
 * other failure throws so `loadTrends` can fall back to the live engine. */
async function fetchTrendFile(word: string): Promise<TrendFile | null> {
  const res = await fetch(dataUrl(`json/trend/${wordKey(word)}.json`))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} fetching trend/${word}`)
  return res.json() as Promise<TrendFile>
}

/** Trends data from the pre-baked per-word JSON - no SQL engine, so mobile
 * never pays the ~35 MB DuckDB-WASM cold-boot. A 404 for a word is treated as
 * "not enough data" (it drops through `toSeries`'s missing list); any other
 * failure degrades to the live engine, same contract as loadFeaturedSeries. */
export async function loadTrends(words: string[], colors: string[]): Promise<TrendsData> {
  try {
    const [totals, files] = await Promise.all([
      bakedYearTotals(),
      Promise.all(words.map(fetchTrendFile)),
    ])
    const rows = words.flatMap((w, i) => (files[i] ? trendYearRows(w, files[i] as TrendFile) : []))
    const wordSeries = toSeries(rows, totals, words, colors)
    const topFilms = new Map<string, TopFilm[]>()
    const topMovies = new Map<string, Map<number, YearTopMovie>>()
    words.forEach((w, i) => {
      const f = files[i]
      if (f) {
        topFilms.set(w, trendTopFilms(f))
        topMovies.set(w, trendByYear(f))
      }
    })
    return { wordSeries, topFilms, topMovies, baked: true }
  } catch (e) {
    console.warn(`trend bake unavailable [${words.join(', ')}] - falling back to the SQL engine`, e)
    return loadTrendsEngine(words, colors)
  }
}

/** Live-engine fallback: the pre-bake queries this replaced, kept working so a
 * stale/missing bake still renders (at the cost of the engine download). */
async function loadTrendsEngine(words: string[], colors: string[]): Promise<TrendsData> {
  const inList = words.map(lit).join(',')
  const [wordSeries, filmRows, movieRows] = await Promise.all([
    loadWordSeries(words, colors),
    q<TopFilm & { word: string }>(
      `SELECT w.word, w.imdb_id, m.title, m.year, w.count::DOUBLE AS count, m.total_words::DOUBLE AS total_words
       FROM ${pq('words_by_word/data.parquet')} w
       JOIN ${pq('movies.parquet')} m USING (imdb_id)
       WHERE w.word IN (${inList})
       QUALIFY ROW_NUMBER() OVER (PARTITION BY w.word ORDER BY w.count DESC, m.title) <= 15
       ORDER BY w.word, count DESC, m.title`,
    ),
    q<YearTopMovie & { word: string; year: number }>(
      `SELECT word, year, imdb_id, title, count FROM (
         SELECT w.word, m.year, w.imdb_id, m.title, w.count::DOUBLE AS count,
                ROW_NUMBER() OVER (PARTITION BY w.word, m.year ORDER BY w.count DESC, m.title) AS rn
         FROM ${pq('words_by_word/data.parquet')} w
         JOIN ${pq('movies.parquet')} m USING (imdb_id)
         WHERE w.word IN (${inList})
       ) WHERE rn = 1`,
    ),
  ])
  const topFilms = new Map<string, TopFilm[]>()
  for (const r of filmRows) {
    const list = topFilms.get(r.word) ?? []
    list.push({ imdb_id: r.imdb_id, title: r.title, year: r.year, count: r.count, total_words: r.total_words })
    topFilms.set(r.word, list)
  }
  return { wordSeries, topFilms, topMovies: groupTopMovies(movieRows), baked: false }
}
