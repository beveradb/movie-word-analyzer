/** Pure logic for the trends view, split out so it's testable without
 * dragging in duckdb-wasm. */

/** Years whose whole corpus has fewer dialogue words than this are hidden from
 * trend charts. Below ~100k words a single film mentioning a word once moves
 * its rate by 10+ per million, so thin years chart as huge fake spikes. That's
 * the pre-1930 silent era (1-16 films each, and intertitles are ~10x shorter
 * than talkie scripts) and the trailing years still being ingested (2-3 films
 * each). Every kept year has 18+ films. */
export const MIN_YEAR_WORDS = 100_000

export interface YearTopMovie {
  imdb_id: string
  title: string
  count: number
}

/** Flat top-movie-per-year query rows → word → year → that year's top movie. */
export const groupTopMovies = (
  rows: (YearTopMovie & { word: string; year: number })[],
): Map<string, Map<number, YearTopMovie>> => {
  const byWord = new Map<string, Map<number, YearTopMovie>>()
  for (const { word, year, imdb_id, title, count } of rows) {
    if (!byWord.has(word)) byWord.set(word, new Map())
    byWord.get(word)!.set(year, { imdb_id, title, count })
  }
  return byWord
}

/** One row per plotted year, ascending; movie is null where the word never
 * occurs so the year sequence stays unbroken. */
export const topMovieRows = (years: number[], byYear: Map<number, YearTopMovie> | undefined) =>
  [...years].sort((a, b) => a - b).map((year) => ({ year, movie: byYear?.get(year) ?? null }))

/** "1916–1929, 2024" from a sorted list of years */
export const formatYearRanges = (years: number[]) =>
  years
    .reduce<[number, number][]>((acc, y) => {
      const last = acc[acc.length - 1]
      if (last && y === last[1] + 1) last[1] = y
      else acc.push([y, y])
      return acc
    }, [])
    .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
    .join(', ')
