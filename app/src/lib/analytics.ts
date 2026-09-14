declare global {
  interface Window {
    goatcounter?: {
      count?: (opts: { path: string; title?: string }) => void
      no_onload?: boolean
    }
  }
}

/** decodeURIComponent that never throws on malformed input. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Map a location.hash to a clean analytics path: section + first id, query
 * params dropped. `#/movie/123?word=love` -> `/movie/123`, `#/` -> `/`. */
export function pathFromHash(hash: string): string {
  const withoutHash = hash.replace(/^#\/?/, '')
  const [pathPart] = withoutHash.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  if (segments.length === 0) return '/'
  return '/' + segments.slice(0, 2).map(safeDecode).join('/')
}

let lastPath: string | null = null

/** Fire a GoatCounter pageview for the current hash. Dedupes consecutive
 * identical paths, and retries (bounded) while the async count.js loads. */
export function trackPageview(attempt = 0): void {
  const path = pathFromHash(window.location.hash)
  if (path === lastPath) return
  const count = window.goatcounter?.count
  if (typeof count !== 'function') {
    // count.js is async; retry for ~3s so the landing pageview isn't lost.
    if (attempt < 20) window.setTimeout(() => trackPageview(attempt + 1), 150)
    return
  }
  lastPath = path
  count({ path, title: document.title })
}
