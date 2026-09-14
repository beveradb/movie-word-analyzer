import { describe, expect, it } from 'vitest'
import { pathFromHash } from './analytics'

describe('pathFromHash', () => {
  it('maps empty and root hashes to /', () => {
    expect(pathFromHash('')).toBe('/')
    expect(pathFromHash('#')).toBe('/')
    expect(pathFromHash('#/')).toBe('/')
  })

  it('keeps a bare section', () => {
    expect(pathFromHash('#/trends')).toBe('/trends')
  })

  it('strips query params', () => {
    expect(pathFromHash('#/trends?word=love')).toBe('/trends')
  })

  it('keeps section + first id', () => {
    expect(pathFromHash('#/movie/123')).toBe('/movie/123')
    expect(pathFromHash('#/movie/123?word=love')).toBe('/movie/123')
  })

  it('drops segments beyond the first id', () => {
    expect(pathFromHash('#/movie/123/extra')).toBe('/movie/123')
  })

  it('decodes encoded ids, tolerating malformed input', () => {
    expect(pathFromHash('#/genre/Sci-Fi')).toBe('/genre/Sci-Fi')
    expect(pathFromHash('#/genre/Action%20%26%20Adventure')).toBe('/genre/Action & Adventure')
    expect(pathFromHash('#/genre/%E0%A4%A')).toBe('/genre/%E0%A4%A')
  })
})
