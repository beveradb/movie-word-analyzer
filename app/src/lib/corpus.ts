/** Corpus registry - the ONLY place corpus ids, bucket prefixes, and corpus
 * copy live. A future subtitle-language corpus or per-language filter adds
 * entries/params here without touching consumers. */
export interface Corpus {
  id: 'en' | 'all'
  /** bucket path prefix ('' or 'all/'); posters stay unprefixed */
  prefix: string
  label: string
  /** compact header-toggle text */
  short: string
  description: string
}

export const CORPORA: Record<string, Corpus> = {
  en: {
    id: 'en',
    prefix: '',
    label: 'English originals',
    short: 'English',
    description:
      'Films originally written in English - subtitles measure the screenwriters.',
  },
  all: {
    id: 'all',
    prefix: 'all/',
    label: 'All films',
    short: 'All films',
    description:
      'Every film, translated subtitles included - counts for non-English originals measure the English translation.',
  },
}

const STORAGE_KEY = 'corpus'

/** Pure resolver: URL ?c= wins, then stored preference, then 'en'. */
export function resolveCorpus(search: string, stored: string | null): Corpus {
  const fromUrl = new URLSearchParams(search).get('c')
  if (fromUrl && CORPORA[fromUrl]) return CORPORA[fromUrl]
  if (stored && CORPORA[stored]) return CORPORA[stored]
  return CORPORA.en
}

let active: Corpus | null = null

/** The corpus for this page load. Toggling reloads the page, so downstream
 * code treats this as a constant - no reactivity anywhere. Lazy so importing
 * this module in a node test environment never touches window. */
export function activeCorpus(): Corpus {
  if (!active) {
    active = resolveCorpus(window.location.search, localStorage.getItem(STORAGE_KEY))
  }
  return active
}

/** Switch corpus: persist the preference and reload with ?c= reflecting the
 * choice (cleared for the default), so shared URLs reproduce the view. The
 * hash route survives the reload untouched. */
export function switchCorpus(id: Corpus['id']): void {
  localStorage.setItem(STORAGE_KEY, id)
  const url = new URL(window.location.href)
  if (id === 'en') url.searchParams.delete('c')
  else url.searchParams.set('c', id)
  window.location.href = url.toString()
}
