import { useEffect, useMemo, useState } from 'react'
import type { MovieDetail } from '../lib/data'
import { getMovie, getWordlists } from '../lib/data'
import { lit, pq, q } from '../lib/duck'
import { navigate, useRoute } from '../lib/route'
import { ErrorBox, MovieSearch, Slug, Spinner } from '../components/ui'

const COLORS = ['#3e6fa8', '#cc5a2e', '#6b5aa8']
const MAX = 3

function useSwearCounts(ids: string[]) {
  const [counts, setCounts] = useState<Map<string, number> | null>(null)
  useEffect(() => {
    if (ids.length === 0) return
    let cancelled = false
    getWordlists()
      .then((wl) =>
        q<{ imdb_id: string; swears: number }>(
          `SELECT imdb_id, SUM(count)::DOUBLE AS swears FROM ${pq('words_by_movie/data.parquet')}
           WHERE imdb_id IN (${ids.map(lit).join(',')})
             AND word IN (${wl.profanity.map(lit).join(',')})
           GROUP BY imdb_id`,
        ),
      )
      .then((rows) => {
        if (cancelled) return
        const m = new Map(ids.map((id) => [id, 0]))
        rows.forEach((r) => m.set(r.imdb_id, r.swears))
        setCounts(m)
      })
      .catch(() => !cancelled && setCounts(null))
    return () => {
      cancelled = true
    }
  }, [ids.join(',')])
  return counts
}

export function CompareView() {
  const { params } = useRoute()
  const ids = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, MAX), [params])
  const [movies, setMovies] = useState<(MovieDetail | null)[]>([])
  const [error, setError] = useState<string | null>(null)
  const swears = useSwearCounts(ids)

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all(ids.map((id) => getMovie(id).catch(() => null)))
      .then((ms) => !cancelled && setMovies(ms))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [ids.join(',')])

  const loaded = movies.filter((m): m is MovieDetail => m !== null)

  const shared = useMemo(() => {
    if (loaded.length < 2) return []
    const sets = loaded.map((m) => new Map(m.distinctive.map(([w, z]) => [w, z])))
    const first = loaded[0].distinctive.map(([w]) => w)
    return first.filter((w) => sets.every((s) => s.has(w))).slice(0, 10)
  }, [loaded])

  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">Put up to three films side by side.</p>
      {ids.length < MAX && (
        <div className="mt-4 max-w-md">
          <MovieSearch
            placeholder={ids.length ? 'Add another film…' : 'Pick the first film…'}
            onPick={(m) => navigate(`/compare?ids=${[...ids, m.id].join(',')}`)}
            autoFocus={ids.length === 0}
          />
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {ids.length > 0 && movies.length === 0 && <Spinner label="Loading scripts…" />}

      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loaded.map((m, i) => {
          const vocab = ((m.stats.unique_words / m.stats.total_words) * 100).toFixed(1)
          const perThousand = swears?.has(m.imdb_id)
            ? ((swears.get(m.imdb_id)! / m.stats.total_words) * 1000).toFixed(1)
            : null
          return (
            <section key={m.imdb_id} className="border-2 border-ink bg-white">
              <div className="border-b-2 border-ink px-4 py-2" style={{ background: `${COLORS[i]}22` }}>
                <Slug prefix={`${i + 1}.`} text={`${m.title} — ${m.year}`} />
                <button
                  onClick={() => navigate(`/compare?ids=${ids.filter((x) => x !== m.imdb_id).join(',')}`)}
                  className="mt-1 text-xs text-ink-2 underline hover:text-ink"
                >
                  remove
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 font-script text-sm">
                <dt className="text-ink-2">Words spoken</dt>
                <dd className="text-right tabular-nums">{m.stats.total_words.toLocaleString()}</dd>
                <dt className="text-ink-2">Distinct words</dt>
                <dd className="text-right tabular-nums">{m.stats.unique_words.toLocaleString()}</dd>
                <dt className="text-ink-2">Vocabulary richness</dt>
                <dd className="text-right tabular-nums">{vocab}%</dd>
                <dt className="text-ink-2">Swears / 1k words</dt>
                <dd className="text-right tabular-nums">{perThousand ?? '…'}</dd>
              </dl>
              <div className="border-t-2 border-paper-2 px-4 py-3">
                <h3 className="text-xs uppercase tracking-wide text-ink-2">Signature words</h3>
                <p className="mt-1.5 font-script text-sm leading-6">
                  {m.distinctive.slice(0, 12).map(([w]) => (
                    <button
                      key={w}
                      onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
                      className="mr-2 hover:bg-mark"
                    >
                      {w}
                    </button>
                  ))}
                </p>
              </div>
              <div className="px-4 pb-3">
                <a href={`#/movie/${m.imdb_id}`} className="font-script text-xs underline">
                  full breakdown →
                </a>
              </div>
            </section>
          )
        })}
      </div>

      {shared.length > 0 && (
        <div className="mt-8 border-2 border-ink bg-white p-4">
          <h2 className="slug text-sm">Words they share</h2>
          <p className="mt-2 font-script">
            {shared.map((w) => (
              <span key={w} className="mr-3 bg-mark px-1">
                {w}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
