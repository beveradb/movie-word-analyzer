import { describe, expect, it } from 'vitest'
import {
  MIN_YEAR_WORDS,
  type TrendFile,
  formatYearRanges,
  groupTopMovies,
  togglePin,
  topMovieRows,
  toSeries,
  trendByYear,
  trendTopFilms,
  trendYearRows,
  wordKey,
} from './trends'

describe('formatYearRanges', () => {
  it('collapses consecutive years into en-dash ranges', () => {
    expect(formatYearRanges([1916, 1922, 1923, 1925, 1927, 1928, 1929, 2024])).toBe(
      '1916, 1922–1923, 1925, 1927–1929, 2024',
    )
  })

  it('handles a single year', () => {
    expect(formatYearRanges([1935])).toBe('1935')
  })

  it('handles one contiguous run', () => {
    expect(formatYearRanges([1914, 1915, 1916])).toBe('1914–1916')
  })

  it('returns empty string for no years', () => {
    expect(formatYearRanges([])).toBe('')
  })
})

describe('groupTopMovies', () => {
  it('groups flat query rows by word, then year', () => {
    const grouped = groupTopMovies([
      { word: 'sword', year: 1935, imdb_id: 'tt1', title: 'Captain Blood', count: 23 },
      { word: 'sword', year: 1938, imdb_id: 'tt2', title: 'Robin Hood', count: 30 },
      { word: 'gun', year: 1935, imdb_id: 'tt3', title: 'G Men', count: 40 },
    ])
    expect([...grouped.keys()]).toEqual(['sword', 'gun'])
    expect(grouped.get('sword')?.get(1935)).toEqual({ imdb_id: 'tt1', title: 'Captain Blood', count: 23 })
    expect(grouped.get('sword')?.get(1938)?.title).toBe('Robin Hood')
    expect(grouped.get('gun')?.get(1938)).toBeUndefined()
  })

  it('returns an empty map for no rows', () => {
    expect(groupTopMovies([]).size).toBe(0)
  })
})

describe('topMovieRows', () => {
  const byYear = new Map([
    [1935, { imdb_id: 'tt1', title: 'Captain Blood', count: 23 }],
    [1937, { imdb_id: 'tt2', title: 'The Prisoner of Zenda', count: 12 }],
  ])

  it('emits one row per plotted year, ascending, with null gaps', () => {
    expect(topMovieRows([1937, 1935, 1936], byYear)).toEqual([
      { year: 1935, movie: { imdb_id: 'tt1', title: 'Captain Blood', count: 23 } },
      { year: 1936, movie: null },
      { year: 1937, movie: { imdb_id: 'tt2', title: 'The Prisoner of Zenda', count: 12 } },
    ])
  })

  it('handles a word with no data at all', () => {
    expect(topMovieRows([1935, 1936], undefined)).toEqual([
      { year: 1935, movie: null },
      { year: 1936, movie: null },
    ])
  })

  it('returns no rows for no years', () => {
    expect(topMovieRows([], byYear)).toEqual([])
  })
})

describe('togglePin', () => {
  it('adds an unpinned year', () => {
    expect(togglePin([1935], 1985)).toEqual([1935, 1985])
  })

  it('removes an already-pinned year', () => {
    expect(togglePin([1935, 1985], 1935)).toEqual([1985])
  })

  it('drops the oldest pin when a 4th is added', () => {
    expect(togglePin([1935, 1960, 1985], 2001)).toEqual([1960, 1985, 2001])
  })

  it('pins the first year on an empty list', () => {
    expect(togglePin([], 1935)).toEqual([1935])
  })
})

describe('MIN_YEAR_WORDS', () => {
  it('sits between the thin silent-era years and the first solid talkie year', () => {
    // 1929 has ~66k corpus words (10 films), 1930 has ~126k (18 films):
    // the floor must separate them or the trim stops doing its job
    expect(MIN_YEAR_WORDS).toBeGreaterThan(66_000)
    expect(MIN_YEAR_WORDS).toBeLessThanOrEqual(126_000)
  })
})

describe('toSeries', () => {
  const totals = new Map([
    [1980, 200_000],
    [1981, 50_000], // below MIN_YEAR_WORDS floor
    [1982, 300_000],
  ])
  const rows = [
    { word: 'love', year: 1980, count: 100 },
    { word: 'love', year: 1981, count: 999 }, // dropped: year below floor
    { word: 'love', year: 1982, count: 300 },
    { word: 'war', year: 1980, count: 50 },
  ]

  it('reports years dropped for being below the corpus-size floor', () => {
    expect(toSeries(rows, totals, ['love', 'war'], ['c1', 'c2']).trimmedYears).toBe('1981')
  })

  it('builds per-million-words series with post-filter colors', () => {
    expect(toSeries(rows, totals, ['love', 'war'], ['c1', 'c2']).series).toEqual([
      {
        name: 'love',
        color: 'c1',
        points: [
          { x: 1980, y: (100 / 200_000) * 1_000_000 },
          { x: 1982, y: (300 / 300_000) * 1_000_000 },
        ],
      },
      { name: 'war', color: 'c2', points: [{ x: 1980, y: (50 / 200_000) * 1_000_000 }] },
    ])
  })

  it('lists plotted years across the kept range, floor gaps excluded', () => {
    expect(toSeries(rows, totals, ['love'], ['c1']).plottedYears).toEqual([1980, 1982])
  })

  it('reports words with no kept data as missing', () => {
    expect(toSeries(rows, totals, ['love', 'ghost'], ['c1', 'c2']).missing).toEqual(['ghost'])
  })
})

describe('wordKey', () => {
  it('leaves RFC3986-unreserved characters literal', () => {
    expect(wordKey('love')).toBe('love')
    expect(wordKey('re-do_now.v2~')).toBe('re-do_now.v2~')
  })

  it("percent-encodes apostrophes so contractions do not 404 (must match Python quote)", () => {
    // encodeURIComponent alone leaves ' literal; Python quote(safe='') encodes it
    expect(wordKey("don't")).toBe('don%27t')
  })

  it('encodes the other sub-delims encodeURIComponent skips', () => {
    expect(wordKey('a!b(c)*d')).toBe('a%21b%28c%29%2Ad')
  })

  it('percent-encodes spaces, slashes and non-ASCII as UTF-8 uppercase hex', () => {
    expect(wordKey('rock and roll')).toBe('rock%20and%20roll')
    expect(wordKey('a/b')).toBe('a%2Fb')
    expect(wordKey('café')).toBe('caf%C3%A9')
  })
})

describe('trend file transforms', () => {
  const file: TrendFile = {
    line: [
      [1978, 78],
      [2001, 104],
    ],
    top: [
      ['tt0120737', 'The Fellowship of the Ring', 2001, 104, 20000],
      ['tt0077869', 'The Lord of the Rings', 1978, 78, 15000],
    ],
    byYear: [
      [1978, 'tt0077869', 'The Lord of the Rings', 78],
      [2001, 'tt0120737', 'The Fellowship of the Ring', 104],
    ],
  }

  it('trendYearRows tags line points with the word', () => {
    expect(trendYearRows('ring', file)).toEqual([
      { word: 'ring', year: 1978, count: 78 },
      { word: 'ring', year: 2001, count: 104 },
    ])
  })

  it('trendTopFilms expands the compact tuples into objects', () => {
    expect(trendTopFilms(file)[0]).toEqual({
      imdb_id: 'tt0120737',
      title: 'The Fellowship of the Ring',
      year: 2001,
      count: 104,
      total_words: 20000,
    })
  })

  it('trendByYear keys the top movie by year', () => {
    const m = trendByYear(file)
    expect(m.get(2001)).toEqual({ imdb_id: 'tt0120737', title: 'The Fellowship of the Ring', count: 104 })
    expect(m.get(1999)).toBeUndefined()
  })
})
