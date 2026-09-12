import { useEffect, useMemo, useState } from 'react'
import { getLeaderboard, getMovieIndex, getWordlists } from '../lib/data'
import { lit, pq, q } from '../lib/duck'
import { navigate } from '../lib/route'
import { ErrorBox, Spinner } from '../components/ui'
import { WordFilterBar, emptyFilter, passesFilter, type WordRow } from '../components/WordFilter'

interface Row {
  word: string
  count: number
  movies: number
  zipf?: number
  classes?: string
}

const YEAR_MIN = 1900
const YEAR_MAX = 2025

export function LeaderboardView() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [stop, setStop] = useState<Set<string>>(new Set())
  const [genres, setGenres] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hideStopwords, setHideStopwords] = useState(true)
  const [wf, setWf] = useState(emptyFilter())
  const [genre, setGenre] = useState('')
  const [from, setFrom] = useState(YEAR_MIN)
  const [to, setTo] = useState(YEAR_MAX)
  const filtered = genre !== '' || from !== YEAR_MIN || to !== YEAR_MAX

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
      getLeaderboard()
        .then((lb) => !cancelled && setRows(lb.words.map((e) => ({ word: e[0], count: e[1], movies: e[2], zipf: e[3] as number | undefined, classes: e[4] as string | undefined }))))
        .catch((e) => !cancelled && setError(String(e)))
      return
    }
    setLoading(true)
    q<Row>(
      `SELECT w.word, SUM(w.count)::DOUBLE AS count, COUNT(DISTINCT w.imdb_id)::DOUBLE AS movies,
              ANY_VALUE(wm.zipf) AS zipf, ANY_VALUE(wm.classes) AS classes
       FROM ${pq('words_by_word/data.parquet')} w
       JOIN ${pq('movies.parquet')} m USING (imdb_id)
       LEFT JOIN ${pq('word_meta.parquet')} wm ON wm.word = w.word
       WHERE m.year BETWEEN ${from} AND ${to}
         ${genre ? `AND list_contains(m.genres, ${lit(genre)})` : ''}
       GROUP BY w.word ORDER BY count DESC LIMIT 400`,
    )
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filtered, from, to, genre])

  const visible = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !hideStopwords || !stop.has(r.word))
        .filter((r) => passesFilter([r.word, r.count, r.zipf, r.classes] as WordRow, wf))
        .slice(0, 50),
    [rows, hideStopwords, stop, wf],
  )
  const max = visible.length ? visible[0].count : 1

  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">The most spoken words across every film in the corpus.</p>

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
        <label className="mb-1.5 ml-auto flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={hideStopwords}
            onChange={(e) => setHideStopwords(e.target.checked)}
            className="accent-[var(--color-ink)]"
          />
          hide stopwords
        </label>
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
    </div>
  )
}
