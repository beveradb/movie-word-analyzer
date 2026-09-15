import { describe, expect, it } from 'vitest'
import { CORPORA, resolveCorpus } from './corpus'

describe('resolveCorpus', () => {
  it('defaults to all', () => {
    expect(resolveCorpus('', null).id).toBe('all')
  })
  it('URL param wins over stored preference', () => {
    expect(resolveCorpus('?c=all', 'en').id).toBe('all')
    expect(resolveCorpus('?c=en', 'all').id).toBe('en')
  })
  it('falls back to stored preference when no param', () => {
    expect(resolveCorpus('', 'en').id).toBe('en')
  })
  it('ignores unknown values from URL and storage, falling back to the default', () => {
    expect(resolveCorpus('?c=klingon', 'bogus').id).toBe('all')
  })
  it('registry carries bucket prefixes', () => {
    expect(CORPORA.en.prefix).toBe('')
    expect(CORPORA.all.prefix).toBe('all/')
  })
})
