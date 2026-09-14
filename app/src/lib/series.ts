import { fetchJSON } from './data'
import { lit, pq, q } from './duck'
import { toSeries, type WordSeries, type YearRow } from './trends'

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
  return loadWordSeries(words, colors)
}
