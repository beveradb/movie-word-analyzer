import { useEffect, useMemo, useState } from 'react'
import type { SignatureEntry } from '../lib/data'
import { getMovie, getSignatures, getWordlists } from '../lib/data'
import { lit, pq, q } from '../lib/duck'
import { navigate, useRoute } from '../lib/route'
import { ErrorBox, MovieSearch, Slug, Spinner } from '../components/ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)']
const MAX = 3

/** URL entity encoding: movie ids verbatim, decades as d:1980, genres as g:Crime. */
interface EntityRef {
  kind: 'movie' | 'decade' | 'genre'
  id: string
}

interface EntityCard {
  ref: EntityRef
  label: string
  films: number
  totalWords: number
  signature: [string, number][]
}

const parseRef = (s: string): EntityRef =>
  s.startsWith('d:')
    ? { kind: 'decade', id: s.slice(2) }
    : s.startsWith('g:')
      ? { kind: 'genre', id: s.slice(2) }
      : { kind: 'movie', id: s }

const encodeRef = (r: EntityRef) =>
  r.kind === 'decade' ? `d:${r.id}` : r.kind === 'genre' ? `g:${r.id}` : r.id

async function loadCard(ref: EntityRef): Promise<EntityCard | null> {
  try {
    if (ref.kind === 'movie') {
      const m = await getMovie(ref.id)
      return {
        ref,
        label: `${m.title} — ${m.year}`,
        films: 1,
        totalWords: m.stats.total_words,
        signature: m.distinctive,
      }
    }
    const sig: SignatureEntry | undefined = (await getSignatures(
      ref.kind === 'decade' ? 'decades' : 'genres',
    ))[ref.id]
    if (!sig) return null
    return {
      ref,
      label: ref.kind === 'decade' ? `THE ${ref.id}S` : ref.id.toUpperCase(),
      films: sig.movie_count,
      totalWords: sig.total_words,
      signature: sig.signature,
    }
  } catch {
    return null
  }
}

/** Swears/1k for movie entities via one DuckDB query (omitted for decades/genres). */
function useSwears(movieIds: string[]) {
  const [swears, setSwears] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (movieIds.length === 0) return
    let cancelled = false
    getWordlists()
      .then((wl) =>
        q<{ imdb_id: string; swears: number }>(
          `SELECT imdb_id, SUM(count)::DOUBLE AS swears FROM ${pq('words_by_movie/data.parquet')}
           WHERE imdb_id IN (${movieIds.map(lit).join(',')})
             AND word IN (${wl.profanity.map(lit).join(',')})
           GROUP BY imdb_id`,
        ),
      )
      .then((rows) => {
        if (cancelled) return
        const m = new Map(movieIds.map((id) => [id, 0]))
        rows.forEach((r) => m.set(r.imdb_id, r.swears))
        setSwears(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [movieIds.join(',')])
  return swears
}

function EntityPicker({ refs }: { refs: EntityRef[] }) {
  const [decades, setDecades] = useState<string[]>([])
  const [genres, setGenres] = useState<string[]>([])
  useEffect(() => {
    getSignatures('decades').then((d) => setDecades(Object.keys(d).sort())).catch(() => {})
    getSignatures('genres').then((g) => setGenres(Object.keys(g).sort())).catch(() => {})
  }, [])
  const add = (ref: EntityRef) =>
    navigate(`/compare?e=${[...refs, ref].map(encodeRef).join(',')}`)
  const selectCls = 'border-2 border-ink bg-card px-2 py-2 font-script text-sm'
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="w-64">
        <MovieSearch
          placeholder={refs.length ? 'Add a film…' : 'Pick a film…'}
          onPick={(m) => add({ kind: 'movie', id: m.id })}
        />
      </div>
      <span className="font-script text-xs uppercase text-ink-2">or</span>
      <select
        className={selectCls}
        value=""
        aria-label="Add a decade"
        onChange={(e) => e.target.value && add({ kind: 'decade', id: e.target.value })}
      >
        <option value="">Add a decade…</option>
        {decades.map((d) => (
          <option key={d} value={d}>
            {d}s
          </option>
        ))}
      </select>
      <select
        className={selectCls}
        value=""
        aria-label="Add a genre"
        onChange={(e) => e.target.value && add({ kind: 'genre', id: e.target.value })}
      >
        <option value="">Add a genre…</option>
        {genres.map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
    </div>
  )
}

export function CompareView() {
  const { params } = useRoute()
  const refs = useMemo(
    () =>
      (params.get('e') ?? params.get('ids') ?? '')
        .split(',')
        .filter(Boolean)
        .map(parseRef)
        .slice(0, MAX),
    [params],
  )
  const [cards, setCards] = useState<(EntityCard | null)[] | null>(null)
  const movieIds = useMemo(() => refs.filter((r) => r.kind === 'movie').map((r) => r.id), [refs])
  const swears = useSwears(movieIds)

  useEffect(() => {
    if (refs.length === 0) {
      setCards([])
      return
    }
    let cancelled = false
    setCards(null)
    Promise.all(refs.map(loadCard)).then((cs) => !cancelled && setCards(cs))
    return () => {
      cancelled = true
    }
  }, [refs.map(encodeRef).join(',')])

  const loaded = (cards ?? []).filter((c): c is EntityCard => c !== null)

  const shared = useMemo(() => {
    if (loaded.length < 2) return []
    const sets = loaded.map((c) => new Set(c.signature.map(([w]) => w)))
    return [...sets[0]].filter((w) => sets.every((s) => s.has(w))).slice(0, 15)
  }, [loaded])
  const sharedSet = useMemo(() => new Set(shared), [shared])

  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">
        Put films, decades, and genres side by side — up to three of any mix.
      </p>
      {refs.length < MAX && <EntityPicker refs={refs} />}
      {refs.length > 0 && cards === null && <Spinner label="Loading…" />}
      {cards !== null && refs.length > 0 && loaded.length === 0 && (
        <ErrorBox message="Nothing found for that selection." retry={() => navigate('/compare')} />
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loaded.map((c, i) => {
          const per1k =
            c.ref.kind === 'movie' && swears.has(c.ref.id)
              ? ((swears.get(c.ref.id)! / c.totalWords) * 1000).toFixed(1)
              : null
          return (
            <section key={encodeRef(c.ref)} className="border-2 border-ink bg-card">
              <div className="border-b-2 border-ink px-4 py-2" style={{ background: `color-mix(in srgb, ${COLORS[i]} 14%, transparent)` }}>
                <Slug prefix={`${i + 1}.`} text={c.label} />
                <button
                  onClick={() =>
                    navigate(
                      `/compare?e=${refs
                        .filter((r) => encodeRef(r) !== encodeRef(c.ref))
                        .map(encodeRef)
                        .join(',')}`,
                    )
                  }
                  className="mt-1 text-xs text-ink-2 underline hover:text-ink"
                >
                  remove
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 font-script text-sm">
                <dt className="text-ink-2">Films</dt>
                <dd className="text-right tabular-nums">{c.films.toLocaleString()}</dd>
                <dt className="text-ink-2">Words spoken</dt>
                <dd className="text-right tabular-nums">{c.totalWords.toLocaleString()}</dd>
                {per1k !== null && (
                  <>
                    <dt className="text-ink-2">Swears / 1k words</dt>
                    <dd className="text-right tabular-nums">{per1k}</dd>
                  </>
                )}
              </dl>
              <div className="border-t-2 border-paper-2 px-4 py-3">
                <h3 className="text-xs uppercase tracking-wide text-ink-2">
                  Signature words <span className="normal-case">(highlighted = shared)</span>
                </h3>
                <p className="mt-1.5 font-script text-sm leading-6">
                  {c.signature.slice(0, 16).map(([w]) => (
                    <button
                      key={w}
                      onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
                      className={`mr-2 hover:bg-mark ${sharedSet.has(w) ? 'bg-mark px-0.5' : ''}`}
                    >
                      {w}
                    </button>
                  ))}
                </p>
              </div>
              {c.ref.kind === 'movie' && (
                <div className="px-4 pb-3">
                  <a href={`#/movie/${c.ref.id}`} className="font-script text-xs underline">
                    full breakdown →
                  </a>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {shared.length > 0 && (
        <div className="mt-8 border-2 border-ink bg-card p-4">
          <h2 className="slug text-sm">Signature words they share</h2>
          <p className="mt-2 font-script">
            {shared.map((w) => (
              <button
                key={w}
                onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
                className="mr-3 bg-mark px-1 hover:underline"
              >
                {w}
              </button>
            ))}
          </p>
        </div>
      )}

      {refs.length === 0 && (
        <div className="mt-8 font-script text-sm text-ink-2">
          <p>Try a classic matchup:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ['The 1950s vs the 2000s', 'd:1950,d:2000'],
              ['Horror vs Comedy', 'g:Horror,g:Comedy'],
              ['Western vs Sci-Fi vs Romance', 'g:Western,g:Sci-Fi,g:Romance'],
            ].map(([label, e]) => (
              <button
                key={e}
                onClick={() => navigate(`/compare?e=${e}`)}
                className="border-2 border-ink bg-card px-3 py-1 hover:bg-mark"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
