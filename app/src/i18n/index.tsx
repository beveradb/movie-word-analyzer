// app/src/i18n/index.tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode, Fragment,
} from 'react'
import { LOCALE_CODES, localeByCode, isRTL } from './locales'
import enMessages from '../messages/en.json'

export type Messages = { [k: string]: string | Messages }

const STORAGE_KEY = 'mw_locale'
const DEFAULT_LOCALE = 'en'
const EN = enMessages as Messages

// Vite code-splits each locale file into its own lazily-fetched chunk.
const loaders = import.meta.glob(['../messages/*.json', '!../messages/en.json']) as Record<
  string,
  () => Promise<{ default: Messages }>
>

export function lookup(messages: Messages, key: string): string | undefined {
  let cur: string | Messages | undefined = messages
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in cur) cur = (cur as Messages)[part]
    else return undefined
  }
  return typeof cur === 'string' ? cur : undefined
}

export function interpolate(tpl: string, vars?: Record<string, string | number>): string {
  if (!vars) return tpl
  return tpl.replace(/\{(\w+)\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m,
  )
}

export function splitNodes(tpl: string, vars: Record<string, ReactNode>): ReactNode[] {
  return tpl.split(/(\{\w+\})/).map((seg) => {
    const m = seg.match(/^\{(\w+)\}$/)
    return m && m[1] in vars ? vars[m[1]] : seg
  })
}

export function resolveInitialLocale(stored: string | null, navLangs: readonly string[]): string {
  if (stored && LOCALE_CODES.includes(stored)) return stored
  for (const lang of navLangs) {
    const prefix = lang.split('-')[0].toLowerCase()
    if (LOCALE_CODES.includes(prefix)) return prefix
  }
  return DEFAULT_LOCALE
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function applyHtmlLangDir(code: string): void {
  const el = document.documentElement
  el.lang = code
  el.dir = isRTL(code) ? 'rtl' : 'ltr'
}

interface I18nValue {
  locale: string
  t: (key: string, vars?: Record<string, string | number>) => string
  tn: (key: string, vars?: Record<string, ReactNode>) => ReactNode
  n: (value: number, opts?: Intl.NumberFormatOptions) => string
  setLocale: (code: string) => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(DEFAULT_LOCALE)
  const [messages, setMessages] = useState<Messages>(EN)
  const latestRequest = useRef(0)

  const loadLocale = useCallback((code: string) => {
    const requestId = ++latestRequest.current

    if (code === DEFAULT_LOCALE) {
      applyHtmlLangDir(DEFAULT_LOCALE)
      setMessages(EN)
      setLocaleState(code)
      return
    }
    const loader = loaders[`../messages/${code}.json`]
    if (!loader) {
      // no bundle yet -> stay English
      applyHtmlLangDir(DEFAULT_LOCALE)
      setMessages(EN)
      setLocaleState(DEFAULT_LOCALE)
      return
    }
    loader()
      .then((mod) => {
        if (latestRequest.current !== requestId) return
        applyHtmlLangDir(code)
        setMessages(mod.default)
        setLocaleState(code)
      })
      .catch(() => {
        if (latestRequest.current !== requestId) return
        applyHtmlLangDir(DEFAULT_LOCALE)
        setMessages(EN)
        setLocaleState(DEFAULT_LOCALE)
      })
  }, [])

  // First load: detect + load. Runs once.
  useEffect(() => {
    const initial = resolveInitialLocale(
      readStored(),
      navigator.languages ?? [navigator.language],
    )
    loadLocale(initial)
  }, [loadLocale])

  const setLocale = useCallback(
    (code: string) => {
      if (!localeByCode(code)) return
      try {
        localStorage.setItem(STORAGE_KEY, code)
      } catch {
        /* storage blocked */
      }
      loadLocale(code)
    },
    [loadLocale],
  )

  const value = useMemo<I18nValue>(() => {
    const intlTag = localeByCode(locale)?.intl ?? 'en-US'
    const t = (key: string, vars?: Record<string, string | number>) => {
      const tpl = lookup(messages, key) ?? lookup(EN, key) ?? key
      return interpolate(tpl, vars)
    }
    const tn = (key: string, vars?: Record<string, ReactNode>) => {
      const tpl = lookup(messages, key) ?? lookup(EN, key) ?? key
      if (!vars) return tpl
      return (
        <>
          {splitNodes(tpl, vars).map((node, i) => (
            <Fragment key={i}>{node}</Fragment>
          ))}
        </>
      )
    }
    const n = (val: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(intlTag, opts).format(val)
    return { locale, t, tn, n, setLocale }
  }, [locale, messages, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
