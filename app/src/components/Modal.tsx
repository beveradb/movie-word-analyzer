import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

/** Minimal accessible dialog: fixed backdrop + centered hard-border card.
 * Closes on Escape and backdrop click; moves focus into the dialog on open and
 * restores the previously-focused element on close. No external dependency. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-md overflow-auto border-2 border-ink bg-paper p-5 text-ink outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-script text-lg font-bold uppercase leading-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modal.closeAriaLabel')}
            className="shrink-0 border-2 border-ink px-2 font-script font-bold hover:bg-mark"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
