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
