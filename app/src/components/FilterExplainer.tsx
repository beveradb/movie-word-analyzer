import { useState } from 'react'
import { Modal } from './Modal'

/** The explainer body: what the language filter selects vs what the word counts
 * actually measure (always the English subtitles). Hyphens only, terse voice. */
function ExplainerContent() {
  return (
    <div className="space-y-3 text-sm leading-6 text-ink">
      <p>
        <strong>What you're filtering:</strong> a film's <em>original language</em> - where it was
        made, from TMDB metadata - not the language of the words below.
      </p>
      <p>
        <strong>What the words are:</strong> every count on Movie Words comes from the film's{' '}
        <strong>English subtitles</strong>. We only have the English OpenSubtitles track, so for a
        non-English film these are the words of its <strong>English translation</strong>, not the
        original dialogue. That's why an untranslated word occasionally slips through - "panna",
        "cotta", "samurai".
      </p>
      <p>
        <strong>So "Spanish" means</strong> the English-subtitle vocabulary of Spanish-<em>origin</em>{' '}
        cinema - how words like "solidarity" or "dictatorship" show up in the English subs of Spanish
        films - not Spanish words.
      </p>
      <p className="text-ink-2">
        Original-language dialogue isn't in the dataset - just the English translation.
      </p>
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
  const [open, setOpen] = useState(false)
  const trigger =
    variant === 'badge' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Original language ${badgeLang} - counts come from the English translated subtitles. How does this work?`}
        className={`shrink-0 cursor-pointer border border-ink-2 px-1 text-[10px] uppercase tracking-wide text-ink-2 hover:bg-mark hover:text-ink ${className}`}
      >
        translated · {badgeLang}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`underline hover:bg-mark ${className}`}
      >
        How does this work?
      </button>
    )
  return (
    <>
      {trigger}
      <Modal open={open} onClose={() => setOpen(false)} title="How this works">
        <ExplainerContent />
      </Modal>
    </>
  )
}
