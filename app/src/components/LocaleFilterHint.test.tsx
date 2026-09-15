// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldSuggest } from './LocaleFilterHint'

describe('shouldSuggest', () => {
  const opts = ['fr', 'es', 'ja']
  it('suggests the locale language when eligible', () => {
    expect(shouldSuggest('es-ES', [], opts, false)).toBe('es')
  })
  it('does not suggest for English, when already filtered, when dismissed, or unlisted', () => {
    expect(shouldSuggest('en-US', [], opts, false)).toBeNull()
    expect(shouldSuggest('es-ES', ['fr'], opts, false)).toBeNull()
    expect(shouldSuggest('es-ES', [], opts, true)).toBeNull()
    expect(shouldSuggest('de-DE', [], opts, false)).toBeNull()
  })
})
