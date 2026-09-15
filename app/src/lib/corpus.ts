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

/** Pure resolver: URL ?c= wins, then stored preference, then the default
 * ('all'). */
export function resolveCorpus(search: string, stored: string | null): Corpus {
  const fromUrl = new URLSearchParams(search).get('c')
  if (fromUrl && CORPORA[fromUrl]) return CORPORA[fromUrl]
  if (stored && CORPORA[stored]) return CORPORA[stored]
  return CORPORA.all
}

let active: Corpus | null = null

/** localStorage can throw (SecurityError) when storage is fully blocked by
 * the browser - treat that the same as "nothing stored" rather than
 * white-screening the header render. */
function readStoredCorpus(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The corpus for this page load. Toggling reloads the page, so downstream
 * code treats this as a constant - no reactivity anywhere. Lazy so importing
 * this module in a node test environment never touches window. */
export function activeCorpus(): Corpus {
  if (!active) {
    active = resolveCorpus(window.location.search, readStoredCorpus())
  }
  return active
}

/** Switch corpus: persist the preference and reload with ?c= reflecting the
 * choice (cleared for the default), so shared URLs reproduce the view. The
 * hash route survives the reload untouched. */
export function switchCorpus(id: Corpus['id']): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage blocked - the URL param still carries the choice.
  }
  const url = new URL(window.location.href)
  if (id === 'all') url.searchParams.delete('c')
  else url.searchParams.set('c', id)
  window.location.href = url.toString()
}
