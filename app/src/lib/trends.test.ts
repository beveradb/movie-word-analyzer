import { describe, expect, it } from 'vitest'
import { MIN_YEAR_WORDS, formatYearRanges } from './trends'

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

describe('MIN_YEAR_WORDS', () => {
  it('sits between the thin silent-era years and the first solid talkie year', () => {
    // 1929 has ~66k corpus words (10 films), 1930 has ~126k (18 films):
    // the floor must separate them or the trim stops doing its job
    expect(MIN_YEAR_WORDS).toBeGreaterThan(66_000)
    expect(MIN_YEAR_WORDS).toBeLessThanOrEqual(126_000)
  })
})
