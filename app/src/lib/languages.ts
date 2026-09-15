import { fetchJSON } from './data'

const STORAGE_KEY = 'langs'

export interface LanguageOption {
  code: string
  films: number
}

const clean = (list: string[]) =>
  [...new Set(list.map((s) => s.trim()).filter(Boolean))]

/** URL ?langs= wins, then stored preference, then [] (= All films).
 * Back-compat with the retired corpus toggle: ?c=en -> ['en'], ?c=all -> []. */
export function resolveLanguages(search: string, stored: string | null): string[] {
  const params = new URLSearchParams(search)
  const fromUrl = params.get('langs')
  if (fromUrl !== null) return clean(fromUrl.split(','))
  const c = params.get('c')
  if (c === 'en') return ['en']
  if (c === 'all') return []
  if (stored) return clean(stored.split(','))
  return []
}

let active: string[] | null = null

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The selected languages for this page load. Non-reactive: the batch-Apply
 * model reloads on change, so downstream code treats this as a constant. */
export function activeLanguages(): string[] {
  if (!active) active = resolveLanguages(window.location.search, readStored())
  return active
}

/** Persist + reload with ?langs= reflecting the choice (cleared when empty, the
 * default). The hash route survives the reload. */
export function switchLanguages(codes: string[]): void {
  const cleaned = clean(codes)
  try {
    if (cleaned.length) localStorage.setItem(STORAGE_KEY, cleaned.join(','))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked - the URL param still carries the choice
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('c') // retire the legacy param on any change
  if (cleaned.length) url.searchParams.set('langs', cleaned.join(','))
  else url.searchParams.delete('langs')
  window.location.href = url.toString()
}

let languagesCache: Promise<LanguageOption[]> | null = null

/** The corpus-filter manifest (>=100-film languages, cn+zh merged), sorted by
 * film count. Global (not per-language). */
export function getLanguages(): Promise<LanguageOption[]> {
  if (!languagesCache) languagesCache = fetchJSON<LanguageOption[]>('json/languages.json')
  return languagesCache
}

/** Localized language name, e.g. languageName('es','en') === 'Spanish'. Falls
 * back to the upper-cased code when Intl doesn't know it. Intl.DisplayNames
 * doesn't throw or return undefined for unknown-but-well-formed codes - it
 * just echoes the code back unchanged, so that case is detected explicitly. */
export function languageName(code: string, locale?: string): string {
  try {
    const dn = new Intl.DisplayNames([locale ?? 'en'], { type: 'language' })
    const name = dn.of(code)
    if (!name || name.toLowerCase() === code.toLowerCase()) return code.toUpperCase()
    return name
  } catch {
    return code.toUpperCase()
  }
}
