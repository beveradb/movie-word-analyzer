// app/src/i18n/index.test.tsx
import { describe, expect, it } from 'vitest'
import { interpolate, resolveInitialLocale, lookup, splitNodes } from './index'

describe('interpolate', () => {
  it('substitutes single-brace vars', () => {
    expect(interpolate('Hi {name}', { name: 'Sam' })).toBe('Hi Sam')
  })
  it('coerces numbers and leaves unknown tokens literal', () => {
    expect(interpolate('{n} films {x}', { n: 5 })).toBe('5 films {x}')
  })
})

describe('lookup', () => {
  const msgs = { a: { b: 'deep' }, top: 'flat' }
  it('resolves dotted paths', () => {
    expect(lookup(msgs, 'a.b')).toBe('deep')
    expect(lookup(msgs, 'top')).toBe('flat')
  })
  it('returns undefined on miss or non-string', () => {
    expect(lookup(msgs, 'a.z')).toBeUndefined()
    expect(lookup(msgs, 'a')).toBeUndefined()
  })
})

describe('resolveInitialLocale', () => {
  it('prefers valid stored value', () => {
    expect(resolveInitialLocale('de', ['fr-FR'])).toBe('de')
  })
  it('falls back to first matching navigator language prefix', () => {
    expect(resolveInitialLocale(null, ['pt-BR', 'en-US'])).toBe('pt')
  })
  it('ignores unknown stored + nav, defaults to en', () => {
    expect(resolveInitialLocale('klingon', ['xx-YY'])).toBe('en')
  })
})

describe('splitNodes', () => {
  it('substitutes react nodes for tokens, keeps literals', () => {
    const out = splitNodes('Read {link} now', { link: 'LINKNODE' })
    expect(out).toEqual(['Read ', 'LINKNODE', ' now'])
  })
})

import { render, screen, act, waitFor, within } from '@testing-library/react'
import { I18nProvider, useI18n } from './index'

function Probe() {
  const { t, n } = useI18n()
  return (
    <div>
      {t('errors.body', { reload: 'RELOADLINK', email: 'EMAILLINK' })} | {n(25515)}
    </div>
  )
}

function ProbeWithSetter() {
  const { t, n, setLocale } = useI18n()
  return (
    <div>
      <div>{t('errors.body', { reload: 'RELOADLINK', email: 'EMAILLINK' })} | {n(25515)}</div>
      <button onClick={() => setLocale('ar')}>switch</button>
    </div>
  )
}

describe('I18nProvider', () => {
  it('renders english by default with locale-formatted numbers', async () => {
    await act(async () => {
      render(<I18nProvider><Probe /></I18nProvider>)
    })
    expect(screen.getByText(/RELOADLINK/)).toBeTruthy()
    expect(screen.getByText(/25,515/)).toBeTruthy() // en-US grouping
  })

  it('falls back to english lang/dir/text when requesting a locale with no bundle yet', async () => {
    let container: HTMLElement
    await act(async () => {
      ;({ container } = render(<I18nProvider><ProbeWithSetter /></I18nProvider>))
    })

    await act(async () => {
      screen.getByText('switch').click()
    })

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en')
      expect(document.documentElement.dir).toBe('ltr')
    })
    expect(within(container!).getByText(/RELOADLINK/)).toBeTruthy()
  })
})
