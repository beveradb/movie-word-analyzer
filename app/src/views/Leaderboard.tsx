import { useEffect, useMemo, useState } from 'react'
import { FilmsBoard, OverviewBoard, ShiftsBoard, UbiquityBoard, WondersBoard } from '../components/boards'
import { getLeaderboard, getMovieIndex, getWordlists } from '../lib/data'
import { lit, pq, q } from '../lib/duck'
import { navigate, useRoute } from '../lib/route'
import { ErrorBox, Spinner } from '../components/ui'
import { WordFilterBar, defaultFilter, passesFilter, type WordRow } from '../components/WordFilter'

interface Row {
  word: string
  count: number
  movies: number
  zipf?: number
  classes?: string
  pos?: string
  dist?: number
}

const YEAR_MIN = 1900
const YEAR_MAX = 2025

const DEFAULT_TAB = 'overview'

/** Trail a fast-changing value; the year inputs fire per keystroke and each
 * filtered query is a full scan of the big parquet, so let typing settle. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const TABS: [string, string][] = [
  [DEFAULT_TAB, 'Overview'],
  ['words', 'Top words'],
  ['shifts', 'Risers & fallers'],
  ['films', 'Film superlatives'],
  ['wonders', 'One-film wonders'],
  ['everywhere', 'Said by every film'],
]

export function LeaderboardView() {
  const { params } = useRoute()
  const tab = params.get('b') ?? DEFAULT_TAB
  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2 font-script text-xs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => navigate(`/leaderboard${key === DEFAULT_TAB ? '' : `?b=${key}`}`)}
            aria-pressed={tab === key}
            className={`border-2 border-ink px-3 py-1 font-bold uppercase ${tab === key ? 'bg-ink text-paper' : 'hover:bg-mark'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'words' && <WordsBoard />}
      {tab === 'shifts' && <ShiftsBoard />}
      {tab === 'films' && <FilmsBoard />}
      {tab === 'wonders' && <WondersBoard />}
      {tab === 'everywhere' && <UbiquityBoard />}
      {(tab === DEFAULT_TAB || !TABS.some(([k]) => k === tab)) && <OverviewBoard />}
    </div>
  )
}

function WordsBoard() {
  const { params } = useRoute()
  const [rows, setRows] = useState<Row[] | null>(null)
  // stopword rows from the pre-baked JSON; merged in for 'all words' mode
  // (the WASM path already includes them in `rows`)
  const [stopRows, setStopRows] = useState<Row[]>([])
  const [stop, setStop] = useState<Set<string>>(new Set())
  const [genres, setGenres] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // ?pos=a preselects a part-of-speech filter, so overview cards can deep-link
  // into their exact view (e.g. adjectives only)
  const [wf, setWf] = useState(() => {
    const f = defaultFilter()
    const pos = params.get('pos')
    if (pos) f.pos = new Set(pos.split(',').filter(Boolean))
    return f
  })
  const [sort, setSort] = useState<'spoken' | 'movieish'>('spoken')
  const [genre, setGenre] = useState('')
  const [from, setFrom] = useState(YEAR_MIN)
  const [to, setTo] = useState(YEAR_MAX)
  // query on settled values only - the inputs update per keystroke
  const qFrom = Math.min(Math.max(useDebounced(from, 500), YEAR_MIN), YEAR_MAX)
  const qTo = Math.min(Math.max(useDebounced(to, 500), YEAR_MIN), YEAR_MAX)
  const filtered = genre !== '' || qFrom !== YEAR_MIN || qTo !== YEAR_MAX

  useEffect(() => {
    getWordlists().then((w) => setStop(new Set(w.stopwords))).catch(() => {})
    getMovieIndex()
      .then((idx) => setGenres([...new Set(idx.flatMap((m) => m.genres))].sort()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (!filtered) {
      // hot path: pre-baked JSON, no WASM needed
      const toRow = (e: [string, number, number, ...unknown[]]): Row => ({
        word: e[0] as string,
        count: e[1] as number,
        movies: e[2] as number,
        zipf: e[3] as number | undefined,
        classes: e[4] as string | undefined,
        pos: e[5] as string | undefined,
        dist: e[6] as number | undefined,
      })
      getLeaderboard()
        .then((lb) => {
          if (cancelled) return
          setRows(lb.words.map(toRow))
          setStopRows(lb.stopwords.map(toRow))
        })
        .catch((e) => !cancelled && setError(String(e)))
      return () => {
        cancelled = true
      }
    }
    setStopRows([])
    setLoading(true)
    q<Row>(
      `SELECT w.word, SUM(w.count)::DOUBLE AS count, COUNT(DISTINCT w.imdb_id)::DOUBLE AS movies,
              ANY_VALUE(wm.zipf) AS zipf, ANY_VALUE(wm.classes) AS classes,
              ANY_VALUE(wm.pos) AS pos, ANY_VALUE(wm.dist) AS dist
       FROM ${pq('words_by_word/data.parquet')} w
       JOIN ${pq('movies.parquet')} m USING (imdb_id)
       LEFT JOIN ${pq('word_meta.parquet')} wm ON wm.word = w.word
       WHERE m.year BETWEEN ${qFrom} AND ${qTo}
         ${genre ? `AND list_contains(m.genres, ${lit(genre)})` : ''}
       GROUP BY w.word ORDER BY count DESC LIMIT 400`,
    )
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filtered, qFrom, qTo, genre])

  const visible = useMemo(
    () =>
      [...(rows ?? []), ...(wf.common === 'all' ? stopRows : [])]
        .filter((r) => passesFilter([r.word, r.count, r.zipf, r.classes, r.pos] as WordRow, wf, stop))
        .sort((a, b) =>
          sort === 'movieish'
            ? b.count * Math.max(b.dist ?? 0, 0) - a.count * Math.max(a.dist ?? 0, 0)
            : b.count - a.count,
        )
        .slice(0, 50),
    [rows, stopRows, stop, wf, sort],
  )
  // bars scale to the largest count on screen, which under the movie-ish
  // sort is not necessarily the first row
  const max = visible.length ? Math.max(...visible.map((r) => r.count)) : 1

  return (
    <div>
      <p className="mt-3 text-sm text-ink-2">The most spoken words across every film in the corpus.</p>

      <div className="mt-4 flex flex-wrap items-end gap-4 border-2 border-ink bg-card p-3 font-script text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-ink-2">From</span>
          <input
            type="number"
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
            className="w-24 border-2 border-ink px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-ink-2">To</span>
          <input
            type="number"
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            className="w-24 border-2 border-ink px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-ink-2">Genre</span>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className="border-2 border-ink px-2 py-1.5">
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <div className="mb-0.5 ml-auto flex flex-col gap-1">
          <span className="text-xs uppercase text-ink-2">Rank by</span>
          <div className="flex text-xs">
            <button
              onClick={() => setSort('spoken')}
              aria-pressed={sort === 'spoken'}
              className={`border-2 border-ink px-2 py-1 ${sort === 'spoken' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
            >
              most spoken
            </button>
            <button
              onClick={() => setSort('movieish')}
              aria-pressed={sort === 'movieish'}
              title="Weights each word by how much more movies say it than everyday English"
              className={`-ml-0.5 border-2 border-ink px-2 py-1 ${sort === 'movieish' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
            >
              most movie-ish
            </button>
          </div>
        </div>
      </div>

      <WordFilterBar filter={wf} onChange={setWf} />
      {error && <ErrorBox message={error} />}
      {loading && <Spinner label="Filtering corpus… (first filtered query loads the analytics engine)" />}
      {!loading && rows && (
        <ol className="mt-5">
          {visible.map((r, i) => (
            <li key={r.word} className="group flex items-center gap-3 py-1">
              <span className="w-7 text-right font-script text-xs text-ink-3">{i + 1}</span>
              <button
                onClick={() => navigate(`/trends?w=${encodeURIComponent(r.word)}`)}
                className="w-32 shrink-0 truncate text-left font-script text-base hover:bg-mark sm:w-40"
              >
                {r.word}
              </button>
              <div className="h-4 min-w-1 rounded-r-[4px] bg-s1" style={{ width: `${(r.count / max) * 100}%` }} />
              <span className="ml-1 shrink-0 font-script text-xs tabular-nums text-ink-2">
                {Number(r.count).toLocaleString()}
                <span className="hidden text-ink-3 sm:inline"> · {r.movies} films</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!loading && rows && visible.length === 0 && (
        <p className="mt-6 font-script text-sm text-ink-2">No words match these filters - try “all words” or “any kind”.</p>
      )}
    </div>
  )
}
