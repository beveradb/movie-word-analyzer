import { useState } from 'react'
import { Modal } from './Modal'
import { useI18n } from '../i18n'

/** The explainer body: what the language filter selects vs what the word counts
 * actually measure (always the English subtitles). Hyphens only, terse voice. */
function ExplainerContent() {
  const { t, tn } = useI18n()
  return (
    <div className="space-y-3 text-sm leading-6 text-ink">
      <p>
        {tn('filterExplainer.filteringBody', {
          whatFiltering: <strong>{t('filterExplainer.whatFiltering')}</strong>,
          originalLanguage: <em>{t('filterExplainer.originalLanguage')}</em>,
        })}
      </p>
      <p>
        {tn('filterExplainer.wordsBody', {
          whatWords: <strong>{t('filterExplainer.whatWords')}</strong>,
          englishSubtitles: <strong>{t('filterExplainer.englishSubtitles')}</strong>,
          englishTranslation: <strong>{t('filterExplainer.englishTranslation')}</strong>,
        })}
      </p>
      <p>
        {tn('filterExplainer.spanishBody', {
          soSpanishMeans: <strong>{t('filterExplainer.soSpanishMeans')}</strong>,
          origin: <em>{t('filterExplainer.origin')}</em>,
        })}
      </p>
      <p className="text-ink-2">{t('filterExplainer.dialogueNote')}</p>
    </div>
  )
}

/** A self-contained trigger that opens the shared filter-explainer modal.
 * `variant="link"` renders an underlined "How does this work?" text link;
 * `variant="badge"` renders the non-English "translated · <lang>" film badge. */
export function ExplainerLink({
  variant = 'link',
  badgeLang,
  className = '',
}: {
  variant?: 'link' | 'badge'
  badgeLang?: string
  className?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const trigger =
    variant === 'badge' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('filterExplainer.badgeTitle', { lang: badgeLang ?? '' })}
        className={`shrink-0 cursor-pointer border border-ink-2 px-1 text-[10px] uppercase tracking-wide text-ink-2 hover:bg-mark hover:text-ink ${className}`}
      >
        {t('filterExplainer.badgeLabel', { lang: badgeLang ?? '' })}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`underline hover:bg-mark ${className}`}
      >
        {t('filterExplainer.linkText')}
      </button>
    )
  return (
    <>
      {trigger}
      <Modal open={open} onClose={() => setOpen(false)} title={t('filterExplainer.modalTitle')}>
        <ExplainerContent />
      </Modal>
    </>
  )
}
