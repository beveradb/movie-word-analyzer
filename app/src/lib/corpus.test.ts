import { describe, expect, it } from 'vitest'
import { CORPORA, resolveCorpus } from './corpus'

describe('resolveCorpus', () => {
  it('defaults to en', () => {
    expect(resolveCorpus('', null).id).toBe('en')
  })
  it('URL param wins over stored preference', () => {
    expect(resolveCorpus('?c=all', 'en').id).toBe('all')
    expect(resolveCorpus('?c=en', 'all').id).toBe('en')
  })
  it('falls back to stored preference when no param', () => {
    expect(resolveCorpus('', 'all').id).toBe('all')
  })
  it('ignores unknown values from URL and storage', () => {
    expect(resolveCorpus('?c=klingon', 'bogus').id).toBe('en')
  })
  it('registry carries bucket prefixes', () => {
    expect(CORPORA.en.prefix).toBe('')
    expect(CORPORA.all.prefix).toBe('all/')
  })
})
