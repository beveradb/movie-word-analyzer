import { useEffect, useState } from 'react'
import { activeLanguages, switchLanguages, getLanguages, languageName } from '../lib/languages'

const DISMISS_KEY = 'langHintDismissed'

/** The locale language to suggest filtering to, or null. */
export function shouldSuggest(locale: string, active: string[], options: string[], dismissed: boolean): string | null {
  if (dismissed || active.length) return null
  const base = locale.split('-')[0].toLowerCase()
  if (base === 'en' || !options.includes(base)) return null
  return base
}

export function LocaleFilterHint() {
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* ignore */ }
    getLanguages().then((opts) => {
      const locale = navigator.language || 'en'
      setCode(shouldSuggest(locale, activeLanguages(), opts.map((o) => o.code), dismissed))
    }).catch(() => {})
  }, [])
  if (!code) return null
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }; setCode(null) }
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-2 border-ink bg-paper-2 px-3 py-2 text-sm">
      <span>Viewing in {languageName(code)}? Filter to {languageName(code)}-language films.</span>
      <span className="flex gap-2">
        <button onClick={() => switchLanguages([code])} className="border-2 border-ink px-2 py-0.5 font-script font-bold uppercase hover:bg-mark">Filter</button>
        <button onClick={dismiss} aria-label="Dismiss" className="px-1 font-bold">✕</button>
      </span>
    </div>
  )
}
