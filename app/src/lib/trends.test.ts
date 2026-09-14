import { describe, expect, it } from 'vitest'
import { MIN_YEAR_WORDS, formatYearRanges, groupTopMovies, togglePin, topMovieRows } from './trends'

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
