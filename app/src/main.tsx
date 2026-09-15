import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider, useI18n } from './i18n'

/** Localized fallback markup for the ErrorBoundary. Extracted into its own
 * function component so it can call useI18n() - the boundary itself is a
 * class component and can't use hooks. */
function ErrorFallback() {
  const { t, tn } = useI18n()
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-script text-sm uppercase tracking-widest text-ink-2">
        {t('errors.eyebrow')}
      </p>
      <h1 className="mt-3 font-script text-2xl font-bold">{t('errors.title')}</h1>
      <p className="mt-3 text-sm text-ink-2">
        {tn('errors.body', {
          reload: (
            <a className="underline" href="/">
              {t('errors.reload')}
            </a>
          ),
          email: (
            <a className="underline" href="mailto:andrew@beveridge.uk?subject=Movie%20Words%20bug">
              andrew@beveridge.uk
            </a>
          ),
        })}
      </p>
    </div>
  )
}

/** Last-resort net: a render-time exception shows a styled apology instead
 * of blanking the whole page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <ErrorFallback />
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
