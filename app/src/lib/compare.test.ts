import { describe, expect, it } from 'vitest'
import { headToHead } from './compare'

const horror = {
  key: 'g:Horror',
  totalWords: 1_000_000,
  words: [
    ['the', 50_000],
    ['scream', 500],
    ['blood', 400],
    ['wedding', 40],
  ] as [string, number][],
}

const comedy = {
  key: 'g:Comedy',
  totalWords: 2_000_000,
  words: [
    ['the', 100_000],
    ['wedding', 2_000],
    ['scream', 100],
    ['blood', 80],
  ] as [string, number][],
}

describe('headToHead', () => {
  it('surfaces words each entity says ≥3× more per million than every other', () => {
    const out = headToHead([horror, comedy])
    const horrorWords = out.get('g:Horror')!.map((r) => r.word)
    const comedyWords = out.get('g:Comedy')!.map((r) => r.word)
    expect(horrorWords).toContain('scream') // 500/1M vs 100/2M = 10×
    expect(horrorWords).toContain('blood') // 400/1M vs 80/2M = 10×
    expect(comedyWords).toContain('wedding') // 2000/2M vs 40/1M = 25×
    expect(horrorWords).not.toContain('the') // same rate both sides
    expect(comedyWords).not.toContain('the')
  })

  it('ranks by ratio and respects topN', () => {
    const out = headToHead([horror, comedy], { topN: 1 })
    expect(out.get('g:Comedy')).toEqual([{ word: 'wedding', ratio: 25 }])
  })

  it('uses the rival list floor for words the rival never says', () => {
    const a = { key: 'a', totalWords: 1000, words: [['zorg', 100], ['tiny', 10]] as [string, number][] }
    const b = { key: 'b', totalWords: 1000, words: [['blah', 100], ['tiny', 10]] as [string, number][] }
    const out = headToHead([a, b], { minCount: 50 })
    // zorg absent from b: floor is b's smallest listed count (10) → ratio 10×
    expect(out.get('a')).toEqual([{ word: 'zorg', ratio: 10 }])
  })

  it('drops words below the minimum count', () => {
    const out = headToHead([horror, comedy], { minCount: 3000 })
    expect(out.get('g:Horror')).toEqual([])
    expect(out.get('g:Comedy')).toEqual([])
  })
})
