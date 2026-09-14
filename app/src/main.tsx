import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/** Last-resort net: a render-time exception shows a styled apology instead
 * of blanking the whole page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="font-script text-sm uppercase tracking-widest text-ink-2">Smash cut to:</p>
        <h1 className="mt-3 font-script text-2xl font-bold">Something broke.</h1>
        <p className="mt-3 text-sm text-ink-2">
          Sorry about that - a{' '}
          <a className="underline" href="/">
            reload
          </a>{' '}
          usually fixes it. Still broken? Email{' '}
          <a className="underline" href="mailto:andrew@beveridge.uk?subject=Movie%20Words%20bug">
            andrew@beveridge.uk
          </a>
          .
        </p>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
