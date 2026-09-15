import { useEffect, useState } from 'react'
import { activeLanguages, switchLanguages, getLanguages, languageName } from '../lib/languages'
import { useI18n } from '../i18n'

const DISMISS_KEY = 'langHintDismissed'

/** The locale language to suggest filtering to, or null. */
export function shouldSuggest(locale: string, active: string[], options: string[], dismissed: boolean): string | null {
  if (dismissed || active.length) return null
  const base = locale.split('-')[0].toLowerCase()
  if (base === 'en' || !options.includes(base)) return null
  return base
}

export function LocaleFilterHint() {
  const { t, locale } = useI18n()
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* ignore */ }
    getLanguages().then((opts) => {
      const navLocale = navigator.language || 'en'
      setCode(shouldSuggest(navLocale, activeLanguages(), opts.map((o) => o.code), dismissed))
    }).catch(() => {})
  }, [])
  if (!code) return null
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }; setCode(null) }
  const name = languageName(code, locale)
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-2 border-ink bg-paper-2 px-3 py-2 text-sm">
      <span>{t('localeFilterHint.message', { lang: name })}</span>
      <span className="flex gap-2">
        <button onClick={() => switchLanguages([code])} className="border-2 border-ink px-2 py-0.5 font-script font-bold uppercase hover:bg-mark">{t('localeFilterHint.filterButton')}</button>
        <button onClick={dismiss} aria-label={t('localeFilterHint.dismissAriaLabel')} className="px-1 font-bold">✕</button>
      </span>
    </div>
  )
}
