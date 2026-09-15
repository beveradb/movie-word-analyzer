import { useEffect, useMemo, useState } from 'react'
import type { MovieIndexEntry, SignatureEntry } from '../lib/data'
import { getFilteredMovieIndex, getSignatures } from '../lib/data'
import { activeLanguages, languageName } from '../lib/languages'
import { navigate } from '../lib/route'
import { ErrorBox, HighlightWord, Poster, Spinner } from '../components/ui'
import { DecadeMotif, GenreMotif } from '../components/motifs'
import { useI18n } from '../i18n'

/** Themed page for a decade (kind=decade, id="1980") or genre (kind=genre, id="Crime"). */
export function EntityView({ kind, id }: { kind: 'decade' | 'genre'; id: string }) {
  const { t, n, locale } = useI18n()
  const [sig, setSig] = useState<SignatureEntry | null | undefined>(undefined)
  const [films, setFilms] = useState<MovieIndexEntry[]>([])

  useEffect(() => {
    setSig(undefined)
    getSignatures(kind === 'decade' ? 'decades' : 'genres')
      .then((all) => setSig(all[id] ?? null))
      .catch(() => setSig(null))
    getFilteredMovieIndex()
      .then((idx) =>
        setFilms(
          idx
            .filter((m) =>
              kind === 'decade' ? Math.floor(m.year / 10) * 10 === Number(id) : m.genres.includes(id),
            )
            .slice(0, 12),
        ),
      )
      .catch(() => {})
  }, [kind, id])

  const label = kind === 'decade' ? t('entity.decadeLabel', { decade: id }) : t('genres.' + id).toUpperCase()
  const subject = kind === 'decade' ? t('entity.decadeSubject', { decade: id }) : t('genres.' + id)
  const sigMax = useMemo(() => (sig?.signature.length ? sig.signature[0][1] : 1), [sig])
  const topMax = useMemo(() => (sig?.top.length ? sig.top[0][1] : 1), [sig])

  if (sig === undefined) return <Spinner label={t('entity.loadingSpinner')} />
  if (sig === null)
    return (
      <ErrorBox
        message={t('entity.notFound', {
          kind: kind === 'decade' ? t('entity.kindDecade') : t('entity.kindGenre'),
          id,
        })}
        retry={() => navigate('/')}
      />
    )

  const langs = activeLanguages()
  if (sig.movie_count === 0) {
    return (
      <p className="mt-8 font-script text-sm text-ink-2">
        {t('entity.notEnoughFilms', {
          langs: langs.map((c) => languageName(c, locale)).join(', '),
          subject: label.toLowerCase(),
        })}
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2">
        <div>
          <p className="font-script text-xs uppercase tracking-widest text-ink-2">
            {kind === 'decade' ? t('entity.decadeEyebrow', { decade: id }) : t('entity.genreEyebrow')}
          </p>
          <h1 className="slug mt-1 text-3xl sm:text-4xl">{label}</h1>
          <p className="mt-1 font-script text-sm text-ink-2">
            {t('entity.statsLine', { films: n(sig.movie_count), words: n(sig.total_words) })}
          </p>
        </div>
        {kind === 'decade' ? (
          <DecadeMotif decade={id} className="h-20 w-32 shrink-0 text-ink-3 sm:h-24 sm:w-40" />
        ) : (
          <GenreMotif genre={id} className="h-20 w-20 shrink-0 text-ink-3 sm:h-24 sm:w-24" />
        )}
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="slug text-sm">{t('entity.signatureWordsHeading')}</h2>
          <p className="mt-1 text-xs text-ink-2">{t('entity.signatureWordsBody', { subject })}</p>
          <div className="mt-3">
            {sig.signature.slice(0, 20).map(([w, z]) => (
              <HighlightWord
                key={w}
                word={w}
                count={z}
                max={sigMax}
                display={n(z, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="slug text-sm">{t('entity.mostSpokenHeading')}</h2>
          <p className="mt-1 text-xs text-ink-2">{t('entity.mostSpokenBody')}</p>
          <ol className="mt-3 grid grid-cols-2 gap-x-6">
            {sig.top.slice(0, 20).map(([w, c], i) => (
              <li key={w} className="flex items-baseline gap-2 border-b border-paper-2 py-1.5 font-script">
                <span className="w-5 text-end text-xs text-ink-3">{i + 1}</span>
                <button className="hover:bg-mark" onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}>
                  {w}
                </button>
                <span className="ms-auto text-xs tabular-nums text-ink-2">
                  {n(c / topMax, { style: 'percent', maximumFractionDigits: 0 })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {films.length > 0 && (
        <section className="mt-10">
          <h2 className="slug border-b-2 border-ink pb-1 text-sm">{t('entity.notableScriptsHeading')}</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {films.map((m) => (
              <button key={m.id} onClick={() => navigate(`/movie/${m.id}`)} className="group text-start">
                <Poster id={m.id} title={m.title} className="w-full border-2 border-ink group-hover:shadow-[4px_4px_0_0_var(--color-ink)]" />
                <div className="mt-1 line-clamp-1 font-script text-xs group-hover:bg-mark">{m.title}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <button
          onClick={() => navigate(`/compare?e=${kind === 'decade' ? 'd' : 'g'}:${id}`)}
          className="border-2 border-ink px-4 py-2 font-script font-bold uppercase hover:bg-mark"
        >
          {t('entity.compareButton', { label })}
        </button>
      </div>
    </div>
  )
}
