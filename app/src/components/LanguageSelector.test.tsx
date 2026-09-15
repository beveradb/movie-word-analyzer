// app/src/components/LanguageSelector.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import LanguageSelector from './LanguageSelector'

describe('LanguageSelector', () => {
  it('shows current language and opens a list of all 33', async () => {
    await act(async () => {
      render(<I18nProvider><LanguageSelector /></I18nProvider>)
    })
    const btn = screen.getByLabelText('Choose language')
    await act(async () => { fireEvent.click(btn) })
    // native names present for a sample of locales
    expect(screen.getByText('Español')).toBeTruthy()
    expect(screen.getByText('日本語')).toBeTruthy()
    expect(screen.getByText('العربية')).toBeTruthy()
  })
})
