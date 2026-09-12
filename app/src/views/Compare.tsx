import { useEffect, useMemo, useState } from 'react'
import type { MovieIndexEntry, SignatureEntry } from '../lib/data'
import { getMovie, getMovieIndex, getSignatures, getWordlists } from '../lib/data'
import { headToHead } from '../lib/compare'
import { lit, pq, q } from '../lib/duck'
import { navigate, useRoute } from '../lib/route'
import { Sparkline } from '../components/LineChart'
import { ErrorBox, MovieSearch, Slug, Spinner } from '../components/ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)']
const MAX = 3

/** Landing matchups, rotated daily so the page never opens empty. */
const MATCHUPS: [string, string][] = [
  ['The 1950s vs the 2000s', 'd:1950,d:2000'],
  ['Horror vs Comedy', 'g:Horror,g:Comedy'],
  ['Western vs Sci-Fi vs Romance', 'g:Western,g:Sci-Fi,g:Romance'],
]

const dayIndex = () => Math.floor(Date.now() / 86_400_000) % MATCHUPS.length

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
  /** [word, count] source for head-to-head rates. */
  words: [string, number][]
  uniqueWords?: number
  swearsPer1k?: number
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
      const words = new Map<string, number>()
      for (const [w, c] of [...m.top_all, ...m.top]) words.set(w as string, c as number)
      return {
        ref,
        label: `${m.title} — ${m.year}`,
        films: 1,
        totalWords: m.stats.total_words,
        signature: m.distinctive,
        words: [...words.entries()],
        uniqueWords: m.stats.unique_words,
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
      words: sig.top_words ?? sig.top,
      uniqueWords: sig.unique_words,
      swearsPer1k: sig.swears_per_1k,
    }
  } catch {
    return null
  }
}

/** Swears/1k for movie entities via one DuckDB query (pre-baked for decades/genres). */
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

/** Films-per-year mini trend for decade/genre cards, from the client-side index. */
function FilmsPerYear({ entityRef, color }: { entityRef: EntityRef; color: string }) {
  const [index, setIndex] = useState<MovieIndexEntry[] | null>(null)
  useEffect(() => {
    getMovieIndex().then(setIndex).catch(() => {})
  }, [])
  const points = useMemo(() => {
    if (!index) return []
    const per = new Map<number, number>()
    for (const m of index) {
      // genres can be null in the index for films TMDB knows no genres for
      if (entityRef.kind === 'genre' && !(m.genres ?? []).includes(entityRef.id)) continue
      if (entityRef.kind === 'decade' && Math.floor(m.year / 10) * 10 !== Number(entityRef.id)) continue
      per.set(m.year, (per.get(m.year) ?? 0) + 1)
    }
    return [...per.entries()].sort((a, b) => a[0] - b[0]) as [number, number][]
  }, [index, entityRef.kind, entityRef.id])
  if (points.length < 2) return null
  return (
    <div className="flex items-center gap-2" title="Films per release year in this slice of the corpus">
      <Sparkline points={points} color={color} width={130} height={22} />
      <span className="text-[10px] uppercase text-ink-3">films / year</span>
    </div>
  )
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

const wordChip = (w: string, extra = '') => (
  <button
    key={w}
    onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
    className={`mr-2 text-left font-script hover:bg-mark ${extra}`}
  >
    {w}
  </button>
)

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
  // empty URL → today's featured matchup, so the page always shows a comparison
  const featured = refs.length === 0 ? MATCHUPS[dayIndex()] : null
  const activeRefs = useMemo(
    () => (featured ? featured[1].split(',').map(parseRef) : refs),
    [featured, refs],
  )
  const [cards, setCards] = useState<(EntityCard | null)[] | null>(null)
  const movieIds = useMemo(
    () => activeRefs.filter((r) => r.kind === 'movie').map((r) => r.id),
    [activeRefs],
  )
  const swears = useSwears(movieIds)

  useEffect(() => {
    let cancelled = false
    setCards(null)
    Promise.all(activeRefs.map(loadCard)).then((cs) => !cancelled && setCards(cs))
    return () => {
      cancelled = true
    }
  }, [activeRefs.map(encodeRef).join(',')])

  // memoized so the h2h/shared memos below actually cache between renders
  const loaded = useMemo(() => (cards ?? []).filter((c): c is EntityCard => c !== null), [cards])

  const h2h = useMemo(() => {
    if (loaded.length < 2) return null
    return headToHead(
      loaded.map((c) => ({ key: encodeRef(c.ref), totalWords: c.totalWords, words: c.words })),
    )
  }, [loaded])

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
      {featured && (
        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="slug text-sm">Featured matchup: {featured[0]}</h2>
          <span className="font-script text-xs text-ink-2">rotates daily — or build your own above</span>
          <span className="font-script text-xs text-ink-2">
            {MATCHUPS.filter((m) => m !== featured).map(([label, e]) => (
              <button key={e} onClick={() => navigate(`/compare?e=${e}`)} className="mr-2 underline hover:bg-mark">
                {label}
              </button>
            ))}
          </span>
        </div>
      )}
      {cards === null && <Spinner label="Loading…" />}
      {cards !== null && loaded.length === 0 && (
        // reload rather than navigate: on the featured (empty-URL) state the
        // hash wouldn't change, so navigating re-fetches nothing
        <ErrorBox message="Nothing found for that selection." retry={() => window.location.reload()} />
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loaded.map((c, i) => {
          const per1k =
            c.ref.kind === 'movie'
              ? swears.has(c.ref.id)
                ? (swears.get(c.ref.id)! / c.totalWords) * 1000
                : null
              : (c.swearsPer1k ?? null)
          return (
            <section key={encodeRef(c.ref)} className="border-2 border-ink bg-card">
              <div
                className="border-b-2 border-ink px-4 py-2"
                style={{ background: `color-mix(in srgb, ${COLORS[i]} 14%, transparent)` }}
              >
                <Slug prefix={`${i + 1}.`} text={c.label} />
                <div className="mt-1 flex items-center justify-between gap-2">
                  {refs.length > 0 ? (
                    <button
                      onClick={() =>
                        navigate(
                          `/compare?e=${refs
                            .filter((r) => encodeRef(r) !== encodeRef(c.ref))
                            .map(encodeRef)
                            .join(',')}`,
                        )
                      }
                      className="text-xs text-ink-2 underline hover:text-ink"
                    >
                      remove
                    </button>
                  ) : (
                    <span />
                  )}
                  {c.ref.kind !== 'movie' && <FilmsPerYear entityRef={c.ref} color={COLORS[i]} />}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 font-script text-sm">
                <dt className="text-ink-2">Films</dt>
                <dd className="text-right tabular-nums">{c.films.toLocaleString()}</dd>
                <dt className="text-ink-2">Words spoken</dt>
                <dd className="text-right tabular-nums">{c.totalWords.toLocaleString()}</dd>
                {c.ref.kind !== 'movie' && (
                  <>
                    <dt className="text-ink-2">Words / film</dt>
                    <dd className="text-right tabular-nums">
                      {Math.round(c.totalWords / Math.max(c.films, 1)).toLocaleString()}
                    </dd>
                  </>
                )}
                {c.uniqueWords !== undefined && (
                  <>
                    <dt className="text-ink-2">Distinct words</dt>
                    <dd className="text-right tabular-nums">{c.uniqueWords.toLocaleString()}</dd>
                  </>
                )}
                {per1k !== null && (
                  <>
                    <dt className="text-ink-2">Swears / 1k words</dt>
                    <dd className="text-right tabular-nums">{per1k.toFixed(1)}</dd>
                  </>
                )}
              </dl>
              <div className="border-t-2 border-paper-2 px-4 py-3">
                <h3 className="text-xs uppercase tracking-wide text-ink-2">
                  Signature words <span className="normal-case">(highlighted = shared)</span>
                </h3>
                <p className="mt-1.5 font-script text-sm leading-6">
                  {c.signature.slice(0, 16).map(([w]) => wordChip(w, sharedSet.has(w) ? 'bg-mark px-0.5' : ''))}
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

      {h2h && (
        <div className="mt-8 border-2 border-ink bg-card p-4">
          <h2 className="slug text-sm">Head to head</h2>
          <p className="mt-1 text-xs text-ink-2">
            What each one says far more than the other{loaded.length > 2 ? 's' : ''} — rate per million words of its
            own dialogue.
          </p>
          <div className="mt-3 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loaded.map((c, i) => {
              const rows = h2h.get(encodeRef(c.ref)) ?? []
              return (
                <section key={encodeRef(c.ref)}>
                  <h3 className="border-b border-paper-2 pb-1 font-script text-sm font-bold" style={{ color: COLORS[i] }}>
                    {c.label}
                  </h3>
                  {rows.length === 0 && <p className="mt-2 font-script text-xs text-ink-3">no standout words</p>}
                  <ol className="mt-2">
                    {rows.map((r) => (
                      <li key={r.word} className="flex items-baseline gap-2 py-0.5 font-script text-sm">
                        {wordChip(r.word, 'font-bold')}
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-2">
                          {r.ratio >= 10 ? Math.round(r.ratio) : r.ratio}× more
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {shared.length > 0 && (
        <div className="mt-8 border-2 border-ink bg-card p-4">
          <h2 className="slug text-sm">Signature words they share</h2>
          <p className="mt-2 font-script">{shared.map((w) => wordChip(w, 'mr-3 bg-mark px-1'))}</p>
        </div>
      )}
    </div>
  )
}
