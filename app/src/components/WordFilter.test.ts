import { describe, expect, it } from 'vitest'
import { defaultFilter, passesFilter, rowPos, type WordRow } from './WordFilter'

// [word, value, zipf, classes, pos]
const know: WordRow = ['know', 100, 6.1, 'nv', 'v']
const sheriff: WordRow = ['sheriff', 50, 4.2, 'n', 'n']
const reckon: WordRow = ['reckon', 30, 3.8, 'v', 'v']
const quickly: WordRow = ['quickly', 20, 4.5, 'r', 'r']
const beautiful: WordRow = ['beautiful', 20, 5.4, 'a', 'a']
const wilson: WordRow = ['wilson', 400, 2.9, 'x', 'x']
const aint: WordRow = ["ain't", 60, 4.4, 'x', 'x']

const f = (over: Partial<ReturnType<typeof defaultFilter>>) => ({ ...defaultFilter(), ...over })

describe('rowPos', () => {
  it('uses the dominant pos column when present', () => {
    expect(rowPos(know)).toBe('v')
  })
  it('falls back to the first classes letter for legacy rows', () => {
    expect(rowPos(['know', 100, 6.1, 'nv'])).toBe('n')
    expect(rowPos(['dead', 10, 5.5, 'sv'])).toBe('a') // satellite folds to adjective
  })
  it('treats rows without any meta as names & other', () => {
    expect(rowPos(['zzgrblx', 5])).toBe('x')
  })
})

describe('passesFilter: commonness', () => {
  it('interesting mode hides high-zipf everyday words', () => {
    expect(passesFilter(know, defaultFilter())).toBe(false)
    expect(passesFilter(beautiful, defaultFilter())).toBe(false)
    expect(passesFilter(sheriff, defaultFilter())).toBe(true)
  })
  it('interesting mode hides stopwords even when zipf is low or missing', () => {
    expect(passesFilter(aint, defaultFilter(), new Set(["ain't"]))).toBe(false)
    expect(passesFilter(['the', 900], defaultFilter(), new Set(['the']))).toBe(false)
  })
  it('all mode shows everything', () => {
    expect(passesFilter(know, f({ common: 'all' }))).toBe(true)
    expect(passesFilter(['the', 900], f({ common: 'all' }), new Set(['the']))).toBe(true)
  })
  it('rows without zipf pass interesting mode (rare by definition)', () => {
    expect(passesFilter(['zzgrblx', 5], defaultFilter())).toBe(true)
  })
})

describe('passesFilter: word kinds', () => {
  const rows = [know, sheriff, reckon, quickly, beautiful, wilson]
  it('empty selection shows every kind', () => {
    expect(rows.filter((r) => passesFilter(r, f({ common: 'all' })))).toHaveLength(rows.length)
  })
  it('single kind shows only that kind', () => {
    const nouns = rows.filter((r) => passesFilter(r, f({ common: 'all', pos: new Set(['n']) })))
    expect(nouns).toEqual([sheriff])
  })
  it('multi-select unions kinds', () => {
    const nv = rows.filter((r) => passesFilter(r, f({ common: 'all', pos: new Set(['n', 'v']) })))
    expect(nv).toEqual([know, sheriff, reckon])
  })
  it('names & other catches interjections/contractions/names', () => {
    const x = rows.filter((r) => passesFilter(r, f({ common: 'all', pos: new Set(['x']) })))
    expect(x).toEqual([wilson])
  })
  it('selecting every kind except nouns excludes only nouns', () => {
    const notN = rows.filter((r) => passesFilter(r, f({ common: 'all', pos: new Set(['v', 'a', 'r', 'x']) })))
    expect(notN).toEqual([know, reckon, quickly, beautiful, wilson])
  })
  it('kind filters compose with interesting mode', () => {
    const interestingNouns = rows.filter((r) => passesFilter(r, f({ pos: new Set(['n']) })))
    expect(interestingNouns).toEqual([sheriff])
  })
})
