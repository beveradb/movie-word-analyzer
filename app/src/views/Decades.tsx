import { useEffect, useState } from 'react'
import { getSignatures } from '../lib/data'
import { activeLanguages, languageName } from '../lib/languages'
import { navigate } from '../lib/route'
import { ErrorBox, Spinner } from '../components/ui'
import { EraMotif } from '../components/motifs'
import { useI18n } from '../i18n'

interface DecadeCard {
  id: string
  movie_count: number
}

/** Index of every decade study, in order - the discovery path into the
 * per-decade #/decade/:id pages, sibling of the Genres index. */
export function DecadesView() {
  const { t, n, locale } = useI18n()
  const [decades, setDecades] = useState<DecadeCard[] | null | undefined>(undefined)

  useEffect(() => {
    getSignatures('decades')
      .then((all) =>
        setDecades(
          Object.entries(all)
            .map(([id, e]) => ({ id, movie_count: e.movie_count }))
            .filter((d) => d.movie_count > 0)
            .sort((a, b) => Number(a.id) - Number(b.id)),
        ),
      )
      .catch(() => setDecades(null))
  }, [])

  if (decades === undefined) return <Spinner label={t('decadesView.loadingSpinner')} />
  if (decades === null)
    return <ErrorBox message={t('decadesView.loadError')} retry={() => navigate('/')} />

  const langs = activeLanguages()
  if (decades.length === 0) {
    return (
      <p className="mt-8 font-script text-sm text-ink-2">
        {t('decadesView.notEnoughFilms', { langs: langs.map((c) => languageName(c, locale)).join(', ') })}
      </p>
    )
  }

  return (
    <div>
      <div className="border-b-2 border-ink pb-2">
        <p className="font-script text-xs uppercase tracking-widest text-ink-2">{t('decadesView.eyebrow')}</p>
        <h1 className="slug mt-1 text-3xl sm:text-4xl">{t('decadesView.title')}</h1>
        <p className="mt-1 font-script text-sm text-ink-2">
          {t('decadesView.subtitle', { count: n(decades.length) })}
        </p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {decades.map((d) => (
          <button
            key={d.id}
            onClick={() => navigate(`/decade/${d.id}`)}
            className="flex flex-col items-start gap-2 border-2 border-ink bg-card p-4 text-start transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <EraMotif decade={d.id} className="h-14 w-14 text-ink-3" />
            <div>
              <div className="font-script text-lg font-bold">{t('decadesView.decadeLabel', { decade: d.id })}</div>
              <div className="font-script text-xs text-ink-2">{t('eras.' + d.id)}</div>
              <div className="mt-1 text-xs text-ink-3">{t('decadesView.filmsCount', { count: n(d.movie_count) })}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
