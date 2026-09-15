import { describe, expect, it } from 'vitest'
import {
  mergeWordRows, mergeYearTotals, mergeTrendLines, mergeSuperlatives, mergeSignatures,
  mergeShifts, mergeWonders, mergeUbiquity,
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

describe('mergeShifts', () => {
  it('dedups risers/fallers by word, keeping the larger |score| entry', () => {
    const es = {
      decades: [1990, 2000],
      risers: [
        { word: 'amor', score: 5, rates: [[1990, 1], [2000, 2]] as [number, number][] },
        { word: 'gato', score: 3, rates: [] as [number, number][] },
      ],
      fallers: [
        { word: 'triste', score: -6, rates: [] as [number, number][] },
      ],
    }
    const fr = {
      decades: [2000, 2010],
      risers: [
        { word: 'amor', score: 8, rates: [[1990, 2], [2000, 3]] as [number, number][] },
        { word: 'chat', score: 4, rates: [] as [number, number][] },
      ],
      fallers: [
        { word: 'triste', score: -2, rates: [] as [number, number][] },
      ],
    }
    const out = mergeShifts([es, fr])
    expect(out.decades).toEqual([1990, 2000, 2010])
    // 'amor' appears once, keeping fr's entry (larger |score|), not duplicated
    expect(out.risers.filter((r) => r.word === 'amor')).toHaveLength(1)
    expect(out.risers.find((r) => r.word === 'amor')?.score).toBe(8)
    expect(out.risers.map((r) => r.word)).toEqual(['amor', 'chat', 'gato'])
    // 'triste' appears once, keeping es's entry (larger |score|)
    expect(out.fallers).toHaveLength(1)
    expect(out.fallers[0].score).toBe(-6)
  })
})

describe('mergeWonders', () => {
  it('drops words contributed by more than one language slice', () => {
    const es = [
      { word: 'amor', id: 'tt1', title: 'A', year: 2000, count: 5, total: 100, share: 0.05 },
      { word: 'unico', id: 'tt2', title: 'B', year: 2001, count: 2, total: 50, share: 0.04 },
    ]
    const fr = [
      { word: 'amor', id: 'tt3', title: 'C', year: 1999, count: 9, total: 90, share: 0.1 },
      { word: 'chat', id: 'tt4', title: 'D', year: 2002, count: 1, total: 20, share: 0.05 },
    ]
    const out = mergeWonders([es, fr])
    // 'amor' is a one-film wonder in each slice individually, but it's really
    // a 2-film word once merged - it must not appear at all
    expect(out.find((r) => r.word === 'amor')).toBeUndefined()
    expect(out.map((r) => r.word)).toEqual(['chat', 'unico'])
  })
})

describe('mergeUbiquity', () => {
  it('derives merged share from summed films / summed nFilms, not max(share)', () => {
    // es: 10 films out of 100; fr: 90 films out of 100 -> merged: 100/200 = 0.5
    const es = [{ word: 'amor', films: 10, share: 0.1 }]
    const fr = [{ word: 'amor', films: 90, share: 0.9 }]
    const out = mergeUbiquity([es, fr])
    const amor = out.find((r) => r.word === 'amor')
    expect(amor?.films).toBe(100)
    expect(amor?.share).toBeCloseTo(0.5)
  })

  it('leaves a single-language word untouched', () => {
    const es = [{ word: 'unico', films: 10, share: 0.2 }]
    const out = mergeUbiquity([es, []])
    const unico = out.find((r) => r.word === 'unico')
    expect(unico?.films).toBe(10)
    expect(unico?.share).toBeCloseTo(0.2)
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
