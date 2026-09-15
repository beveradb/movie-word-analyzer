import { describe, expect, it } from 'vitest'
import {
  mergeWordRows, mergeYearTotals, mergeTrendLines, mergeSuperlatives, mergeSignatures,
} from './merge'

describe('mergeWordRows', () => {
  it('sums count + movie_count by word and re-sorts', () => {
    const es = [['amor', 100, 3, 4.1, 'n', 'n'], ['gato', 40, 2, 3.0, 'n', 'n']]
    const fr = [['amor', 60, 2, 4.1, 'n', 'n'], ['chat', 90, 3, 3.2, 'n', 'n']]
    const out = mergeWordRows([es, fr] as never, 10)
    expect(out[0]).toEqual(['amor', 160, 5, 4.1, 'n', 'n'])
    expect(out.map((r) => r[0])).toEqual(['amor', 'chat', 'gato'])
  })
})

describe('mergeYearTotals', () => {
  it('sums per-year totals across languages', () => {
    const a = new Map([[2000, 100], [2001, 50]])
    const b = new Map([[2001, 30], [2002, 10]])
    expect([...mergeYearTotals([a, b]).entries()].sort()).toEqual([[2000, 100], [2001, 80], [2002, 10]])
  })
})

describe('mergeTrendLines', () => {
  it('sums per-year counts (exact), ascending', () => {
    expect(mergeTrendLines([[[2000, 5], [2001, 3]], [[2001, 4], [2002, 1]]]))
      .toEqual([[2000, 5], [2001, 7], [2002, 1]])
  })
})

describe('mergeSuperlatives', () => {
  it('concatenates + re-ranks each category by value desc', () => {
    const a = { chattiest: [{ id: '1', title: 'A', year: 2000, value: 9 }], vocabulary: [], sweariest: [], repetitive: [] }
    const b = { chattiest: [{ id: '2', title: 'B', year: 2001, value: 12 }], vocabulary: [], sweariest: [], repetitive: [] }
    const out = mergeSuperlatives([a, b])
    expect(out.chattiest.map((f) => f.id)).toEqual(['2', '1'])
  })
})

describe('mergeSignatures', () => {
  it('sums entity counts and recomputes a head-accurate signature', () => {
    const a = { '2000': { movie_count: 2, total_words: 200, top: [['amor', 120], ['casa', 40]] as [string, number][], signature: [] } }
    const b = { '2000': { movie_count: 3, total_words: 300, top: [['amor', 80], ['mar', 60]] as [string, number][], signature: [] } }
    const out = mergeSignatures([a, b])
    expect(out['2000'].movie_count).toBe(5)
    expect(out['2000'].total_words).toBe(500)
    // 'amor' count summed in the merged top
    expect(out['2000'].top.find((t) => t[0] === 'amor')?.[1]).toBe(200)
    expect(out['2000'].signature.length).toBeGreaterThan(0)
  })
})
