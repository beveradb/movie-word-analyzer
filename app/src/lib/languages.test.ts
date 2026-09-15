import { describe, expect, it } from 'vitest'
import { resolveLanguages, languageName } from './languages'

describe('resolveLanguages', () => {
  it('defaults to empty (All films)', () => {
    expect(resolveLanguages('', null)).toEqual([])
  })
  it('reads ?langs= as ordered unique codes', () => {
    expect(resolveLanguages('?langs=es,fr,es', null)).toEqual(['es', 'fr'])
  })
  it('URL wins over stored', () => {
    expect(resolveLanguages('?langs=ja', 'es,fr')).toEqual(['ja'])
  })
  it('falls back to stored when no param', () => {
    expect(resolveLanguages('', 'es,fr')).toEqual(['es', 'fr'])
  })
  it('back-compat: ?c=en -> [en], ?c=all -> []', () => {
    expect(resolveLanguages('?c=en', null)).toEqual(['en'])
    expect(resolveLanguages('?c=all', null)).toEqual([])
  })
  it('drops blanks/whitespace', () => {
    expect(resolveLanguages('?langs=es,,%20fr%20', null)).toEqual(['es', 'fr'])
  })
})

describe('languageName', () => {
  it('localizes known codes', () => {
    expect(languageName('es', 'en')).toBe('Spanish')
    expect(languageName('fr', 'en')).toBe('French')
  })
  it('falls back to upper-cased code for unknowns', () => {
    expect(languageName('zz', 'en')).toBe('ZZ')
  })
})
