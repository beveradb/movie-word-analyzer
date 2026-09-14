import { describe, expect, it } from 'vitest'
import { FEATURED, stepFeatured } from './featured'

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

describe('FEATURED', () => {
  it('is a non-empty list of titled word groups', () => {
    expect(FEATURED.length).toBeGreaterThan(0)
    for (const f of FEATURED) {
      expect(typeof f.title).toBe('string')
      expect(f.words.length).toBeGreaterThan(0)
    }
  })
})
