import { describe, expect, it } from 'vitest'
import { LOCALES, LOCALE_CODES, localeByCode, isRTL } from './locales'

describe('locales table', () => {
  it('has 33 entries with en first', () => {
    expect(LOCALES).toHaveLength(33)
    expect(LOCALES[0].code).toBe('en')
  })
  it('has unique codes', () => {
    expect(new Set(LOCALE_CODES).size).toBe(33)
  })
  it('marks ar and he RTL and nothing else', () => {
    expect(LOCALES.filter((l) => l.rtl).map((l) => l.code).sort()).toEqual(['ar', 'he'])
    expect(isRTL('ar')).toBe(true)
    expect(isRTL('es')).toBe(false)
  })
  it('every entry has native, english, flag, intl', () => {
    for (const l of LOCALES) {
      expect(l.native && l.english && l.flag && l.intl).toBeTruthy()
    }
  })
  it('localeByCode resolves and misses gracefully', () => {
    expect(localeByCode('de')?.english).toBe('German')
    expect(localeByCode('klingon')).toBeUndefined()
  })
})
