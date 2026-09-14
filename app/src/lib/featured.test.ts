import { describe, expect, it } from 'vitest'
import { FEATURED, MATCHUPS, dayIndex, stepFeatured } from './featured'

describe('stepFeatured', () => {
  it('advances forward', () => {
    expect(stepFeatured(2, 1, 6)).toBe(3)
  })

  it('steps backward', () => {
    expect(stepFeatured(2, -1, 6)).toBe(1)
  })

  it('wraps forward past the end', () => {
    expect(stepFeatured(5, 1, 6)).toBe(0)
  })

  it('wraps backward before the start', () => {
    expect(stepFeatured(0, -1, 6)).toBe(5)
  })
})

describe('dayIndex', () => {
  it('is a valid index for any pool size', () => {
    for (const len of [1, 6, FEATURED.length, MATCHUPS.length]) {
      const i = dayIndex(len)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(len)
    }
  })
})

describe('FEATURED', () => {
  it('has at least 50 trends to cycle through', () => {
    expect(FEATURED.length).toBeGreaterThanOrEqual(50)
  })

  it('every trend has a title and 1-4 lowercase words', () => {
    for (const f of FEATURED) {
      expect(f.title.length).toBeGreaterThan(0)
      expect(f.words.length).toBeGreaterThanOrEqual(1)
      expect(f.words.length).toBeLessThanOrEqual(4)
      for (const w of f.words) expect(w).toBe(w.toLowerCase().trim())
    }
  })

  it('has no duplicate titles or word groups', () => {
    const titles = FEATURED.map((f) => f.title)
    expect(new Set(titles).size).toBe(titles.length)
    const groups = FEATURED.map((f) => [...f.words].sort().join(','))
    expect(new Set(groups).size).toBe(groups.length)
  })

  it('copy style: titles use " - ", never em-dashes', () => {
    for (const f of FEATURED) expect(f.title).not.toMatch(/[—–]/)
  })
})

describe('MATCHUPS', () => {
  it('has at least 50 matchups to cycle through', () => {
    expect(MATCHUPS.length).toBeGreaterThanOrEqual(50)
  })

  it('every matchup has a title and 2-3 well-formed refs', () => {
    for (const m of MATCHUPS) {
      expect(m.title.length).toBeGreaterThan(0)
      const refs = m.e.split(',')
      expect(refs.length).toBeGreaterThanOrEqual(2)
      expect(refs.length).toBeLessThanOrEqual(3)
      for (const r of refs) {
        // movie ids verbatim, decades as d:1980, genres as g:Crime
        expect(r).toMatch(/^(tt\d{7,8}|d:\d{4}|g:[A-Za-z-]+)$/)
      }
    }
  })

  it('has no duplicate titles or ref sets', () => {
    const titles = MATCHUPS.map((m) => m.title)
    expect(new Set(titles).size).toBe(titles.length)
    const refs = MATCHUPS.map((m) => m.e.split(',').sort().join(','))
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('never compares an entity with itself', () => {
    for (const m of MATCHUPS) {
      const refs = m.e.split(',')
      expect(new Set(refs).size).toBe(refs.length)
    }
  })

  it('copy style: titles use " - ", never em-dashes', () => {
    for (const m of MATCHUPS) expect(m.title).not.toMatch(/[—–]/)
  })
})
