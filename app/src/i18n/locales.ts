import data from './locales.json'

export interface LocaleInfo {
  code: string
  native: string
  english: string
  flag: string
  rtl: boolean
  intl: string
}

export const LOCALES: LocaleInfo[] = data as LocaleInfo[]
export const LOCALE_CODES: string[] = LOCALES.map((l) => l.code)

const byCode = new Map(LOCALES.map((l) => [l.code, l]))

export function localeByCode(code: string): LocaleInfo | undefined {
  return byCode.get(code)
}

export function isRTL(code: string): boolean {
  return byCode.get(code)?.rtl ?? false
}
