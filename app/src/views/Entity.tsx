import { useEffect, useMemo, useState } from 'react'
import type { MovieIndexEntry, SignatureEntry } from '../lib/data'
import { getMovieIndex, getSignatures } from '../lib/data'
import { navigate } from '../lib/route'
import { ErrorBox, HighlightWord, Poster, Spinner } from '../components/ui'
import { DecadeMotif, GenreMotif } from '../components/motifs'

/** Themed page for a decade (kind=decade, id="1980") or genre (kind=genre, id="Crime"). */
export function EntityView({ kind, id }: { kind: 'decade' | 'genre'; id: string }) {
  const [sig, setSig] = useState<SignatureEntry | null | undefined>(undefined)
  const [films, setFilms] = useState<MovieIndexEntry[]>([])

  useEffect(() => {
    setSig(undefined)
    getSignatures(kind === 'decade' ? 'decades' : 'genres')
      .then((all) => setSig(all[id] ?? null))
      .catch(() => setSig(null))
    getMovieIndex()
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

  const label = kind === 'decade' ? `THE ${id}S` : id.toUpperCase()
  const sigMax = useMemo(() => (sig?.signature.length ? sig.signature[0][1] : 1), [sig])
  const topMax = useMemo(() => (sig?.top.length ? sig.top[0][1] : 1), [sig])

  if (sig === undefined) return <Spinner label="Loading…" />
  if (sig === null)
    return <ErrorBox message={`No ${kind} “${id}” in the dataset.`} retry={() => navigate('/')} />

  return (
    <div>
      <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2">
        <div>
          <p className="font-script text-xs uppercase tracking-widest text-ink-2">
            {kind === 'decade' ? 'Est. ' + id : 'Genre study'}
          </p>
          <h1 className="slug mt-1 text-3xl sm:text-4xl">{label}</h1>
          <p className="mt-1 font-script text-sm text-ink-2">
            {sig.movie_count.toLocaleString()} films · {sig.total_words.toLocaleString()} words of dialogue
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
          <h2 className="slug text-sm">Signature words</h2>
          <p className="mt-1 text-xs text-ink-2">
            What {kind === 'decade' ? `the ${id}s` : id} talks about far more than movies overall.
          </p>
          <div className="mt-3">
            {sig.signature.slice(0, 20).map(([w, z]) => (
              <HighlightWord
                key={w}
                word={w}
                count={z}
                max={sigMax}
                display={z.toFixed(1)}
                onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="slug text-sm">Most spoken words</h2>
          <p className="mt-1 text-xs text-ink-2">Plain counts, stopwords excluded.</p>
          <ol className="mt-3 grid grid-cols-2 gap-x-6">
            {sig.top.slice(0, 20).map(([w, c], i) => (
              <li key={w} className="flex items-baseline gap-2 border-b border-paper-2 py-1.5 font-script">
                <span className="w-5 text-right text-xs text-ink-3">{i + 1}</span>
                <button className="hover:bg-mark" onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}>
                  {w}
                </button>
                <span className="ml-auto text-xs tabular-nums text-ink-2">
                  {((c / topMax) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {films.length > 0 && (
        <section className="mt-10">
          <h2 className="slug border-b-2 border-ink pb-1 text-sm">Notable scripts</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {films.map((m) => (
              <button key={m.id} onClick={() => navigate(`/movie/${m.id}`)} className="group text-left">
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
          Compare {label} with…
        </button>
      </div>
    </div>
  )
}
