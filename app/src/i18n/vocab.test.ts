import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'

describe('fixed vocabularies present in en.json', () => {
  it('has genres, pos, eras, languageFilter namespaces', () => {
    const m = en as Record<string, Record<string, unknown>>
    expect(Object.keys(m.genres ?? {}).length).toBeGreaterThanOrEqual(10)
    expect(m.pos?.noun).toBe('noun')
    expect(m.languageFilter?.allFilms).toBeTruthy()
    expect(m.languageFilter?.hint).toBeTruthy()
  })

  it('covers every genre the pipeline actually emits (IMDb genres, en + all corpora)', () => {
    // Enumerated from live data: data.moviewords.org/json/signature/genres.json
    // and .../all/json/signature/genres.json (2026-09-14).
    const liveGenres = [
      'Action', 'Adult', 'Adventure', 'Animation', 'Biography', 'Comedy',
      'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir',
      'History', 'Horror', 'Music', 'Musical', 'Mystery', 'News',
      'Reality-TV', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
    ]
    for (const g of liveGenres) {
      expect(en.genres).toHaveProperty(g, g)
    }
  })

  it('has a pos entry for every word-kind code the UI filters on (n/v/a/r/x)', () => {
    expect(en.pos.noun).toBe('noun')
    expect(en.pos.verb).toBe('verb')
    expect(en.pos.adjective).toBe('adjective')
    expect(en.pos.adverb).toBe('adverb')
    expect(en.pos.other).toBe('other')
  })

  it('has an era tagline for every decade shown on the Decades index', () => {
    const decades = [
      '1910', '1920', '1930', '1940', '1950', '1960',
      '1970', '1980', '1990', '2000', '2010', '2020',
    ]
    for (const d of decades) {
      expect(typeof en.eras[d as keyof typeof en.eras]).toBe('string')
    }
  })
})
