import { useEffect, useMemo, useState } from 'react'
import { getShifts, type Shifts } from '../lib/data'
import { lit, pq, q } from '../lib/duck'
import { navigate, useRoute } from '../lib/route'
import {
  MIN_YEAR_WORDS,
  type YearTopMovie,
  formatYearRanges,
  groupTopMovies,
  topMovieRows,
} from '../lib/trends'
import { LineChart, type Series } from '../components/LineChart'
import { ErrorBox, Spinner } from '../components/ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)', 'var(--color-s4)']
const MAX_WORDS = 4

/** Landing charts, rotated daily so the page never opens empty. Every word is
 * a verified riser/faller from the shifts leaderboard. */
const FEATURED: { title: string; words: string[] }[] = [
  { title: 'The phone replaced the telegram', words: ['phone', 'telegram'] },
  { title: "How movies stopped saying 'shall'", words: ['gonna', 'shall'] },
  { title: 'Screens took over the script', words: ['computer', 'tv', 'radio'] },
  { title: "From 'fellow' to 'dude'", words: ['dude', 'fellow'] },
  { title: 'Cinema learned to swear', words: ['fucking', 'darling'] },
  { title: 'Monsieur, madame — au revoir', words: ['monsieur', 'madame', 'okay'] },
]

const dayIndex = () => Math.floor(Date.now() / 86_400_000) % FEATURED.length

/** Riser/faller chips under the featured chart — one tap to chart a mover. */
function ShiftStrip() {
  const [shifts, setShifts] = useState<Shifts | null>(null)
  useEffect(() => {
    getShifts().then(setShifts).catch(() => {})
  }, [])
  if (!shifts) return null
  const chip = (w: string, dir: '↑' | '↓') => (
    <button
      key={w}
      onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
      className="border-2 border-ink bg-card px-2 py-0.5 hover:bg-mark"
    >
      {dir} {w}
    </button>
  )
  return (
    <div className="mt-6 font-script text-sm text-ink-2">
      <p className="text-xs uppercase tracking-wide">Big movers since the 1930s</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {shifts.risers.slice(0, 6).map((r) => chip(r.word, '↑'))}
        {shifts.fallers.slice(0, 6).map((r) => chip(r.word, '↓'))}
        <a href="#/leaderboard?b=shifts" className="ml-1 underline hover:bg-mark">
          full list →
        </a>
      </div>
    </div>
  )
}

interface TopFilmRow {
  imdb_id: string
  title: string
  year: number
  count: number
  total_words: number
}

/** Answers "which movie says this word the most?" */
function TopFilms({ word }: { word: string }) {
  const [rows, setRows] = useState<TopFilmRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    q<TopFilmRow>(
      `SELECT w.imdb_id, m.title, m.year, w.count::DOUBLE AS count, m.total_words::DOUBLE AS total_words
       FROM ${pq('words_by_word/data.parquet')} w
       JOIN ${pq('movies.parquet')} m USING (imdb_id)
       WHERE w.word = ${lit(word)} ORDER BY w.count DESC LIMIT 15`,
    )
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [word])

  if (rows === null) return <Spinner label={`Finding films that say “${word}” most…`} />
  if (rows.length === 0) return null
  const max = rows[0].count
  return (
    <div className="mt-6 border-2 border-ink bg-card p-4">
      <h2 className="slug text-sm">Films that say “{word}” the most</h2>
      <ol className="mt-3">
        {rows.map((r, i) => (
          <li key={r.imdb_id} className="flex items-center gap-3 py-1">
            <span className="w-6 text-right font-script text-xs text-ink-3">{i + 1}</span>
            <a
              href={`#/movie/${r.imdb_id}`}
              className="w-56 shrink-0 truncate font-script hover:bg-mark sm:w-72"
            >
              {r.title} <span className="text-xs text-ink-2">({r.year})</span>
            </a>
            <div className="h-4 min-w-1 rounded-r-[4px] bg-s1" style={{ width: `${(r.count / max) * 60}%` }} />
            <span className="shrink-0 font-script text-xs tabular-nums text-ink-2">
              {r.count.toLocaleString()}×
              <span className="hidden text-ink-3 sm:inline">
                {' '}
                · {((r.count / r.total_words) * 1000).toFixed(1)}/1k words
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** All plotted years for the active word, each with its top word-using film. */
function TopFilmsByYear({
  word,
  years,
  byYear,
}: {
  word: string
  years: number[]
  byYear: Map<number, YearTopMovie> | undefined
}) {
  const rows = topMovieRows(years, byYear)
  if (rows.length === 0) return null
  return (
    <div className="mt-6 border-2 border-ink bg-card p-4">
      <h2 className="slug text-sm">Top film for “{word}” by year</h2>
      <div className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ year, movie }) => (
          <div key={year} className="flex items-baseline gap-2 py-0.5 font-script text-sm">
            <span className="shrink-0 tabular-nums text-xs text-ink-2">{year}</span>
            {movie ? (
              <>
                <a href={`#/movie/${movie.imdb_id}`} className="min-w-0 truncate hover:bg-mark">
                  {movie.title}
                </a>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-3">
                  {movie.count.toLocaleString()}×
                </span>
              </>
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tabbed per-word detail tables; tabs only appear with 2+ words. */
function WordDetails({
  words,
  years,
  topMovies,
}: {
  words: string[]
  years: number[]
  topMovies: Map<string, Map<number, YearTopMovie>>
}) {
  const [active, setActive] = useState(0)
  const word = words[Math.min(active, words.length - 1)]
  return (
    <div>
      {words.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Word details">
          {words.map((w, i) => (
            <button
              key={w}
              role="tab"
              aria-selected={w === word}
              onClick={() => setActive(i)}
              className={`flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-script text-sm ${
                w === word ? 'bg-mark font-bold' : 'bg-card hover:bg-paper-2'
              }`}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[i] }} />
              {w}
            </button>
          ))}
        </div>
      )}
      <TopFilms word={word} />
      <TopFilmsByYear word={word} years={years} byYear={topMovies.get(word)} />
    </div>
  )
}

interface YearRow {
  word: string
  year: number
  count: number
}

let yearTotalsCache: Map<number, number> | null = null

async function yearTotals(): Promise<Map<number, number>> {
  if (yearTotalsCache) return yearTotalsCache
  const rows = await q<{ year: number; total: number }>(
    `SELECT year, SUM(count)::DOUBLE AS total FROM ${pq('word_year.parquet')} GROUP BY year`,
  )
  yearTotalsCache = new Map(rows.map((r) => [r.year, r.total]))
  return yearTotalsCache
}

export function TrendsView() {
  const { params } = useRoute()
  const words = useMemo(
    () => (params.get('w') ?? '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, MAX_WORDS),
    [params],
  )
  const [input, setInput] = useState('')
  const [series, setSeries] = useState<Series[] | null>(null)
  const [topMovies, setTopMovies] = useState<Map<string, Map<number, YearTopMovie>>>(new Map())
  const [plottedYears, setPlottedYears] = useState<number[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [trimmedYears, setTrimmedYears] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // no words in the URL → chart today's featured shift instead of a blank page
  const featured = words.length === 0 ? FEATURED[dayIndex()] : null
  const chartWords = featured ? featured.words : words

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      q<YearRow>(
        `SELECT word, year, count::DOUBLE AS count FROM ${pq('word_year.parquet')}
         WHERE word IN (${chartWords.map(lit).join(',')}) ORDER BY word, year`,
      ),
      yearTotals(),
      q<YearTopMovie & { word: string; year: number }>(
        `SELECT word, year, imdb_id, title, count FROM (
           SELECT w.word, m.year, w.imdb_id, m.title, w.count::DOUBLE AS count,
                  ROW_NUMBER() OVER (PARTITION BY w.word, m.year ORDER BY w.count DESC, m.title) AS rn
           FROM ${pq('words_by_word/data.parquet')} w
           JOIN ${pq('movies.parquet')} m USING (imdb_id)
           WHERE w.word IN (${chartWords.map(lit).join(',')})
         ) WHERE rn = 1`,
      ),
    ])
      .then(([rows, totals, topRows]) => {
        if (cancelled) return
        const kept = rows.filter((r) => (totals.get(r.year) ?? 0) >= MIN_YEAR_WORDS)
        const droppedYears = [...new Set(
          rows.filter((r) => (totals.get(r.year) ?? 0) < MIN_YEAR_WORDS).map((r) => r.year),
        )].sort((a, b) => a - b)
        setTrimmedYears(droppedYears.length ? formatYearRanges(droppedYears) : null)
        const byWord = new Map<string, YearRow[]>()
        kept.forEach((r) => byWord.set(r.word, [...(byWord.get(r.word) ?? []), r]))
        setMissing(chartWords.filter((w) => !byWord.has(w)))
        const grouped = groupTopMovies(topRows)
        setTopMovies(grouped)
        // every corpus year with enough data inside the chart's x-range, so the
        // by-year table lists the same years the chart plots, gaps included
        const keptYears = kept.map((r) => r.year)
        setPlottedYears(
          keptYears.length
            ? [...totals.entries()]
                .filter(([y, t]) => t >= MIN_YEAR_WORDS && y >= Math.min(...keptYears) && y <= Math.max(...keptYears))
                .map(([y]) => y)
                .sort((a, b) => a - b)
            : [],
        )
        setSeries(
          chartWords
            .filter((w) => byWord.has(w))
            .map((w, i) => ({
              name: w,
              color: COLORS[i],
              points: byWord.get(w)!.map((r) => ({
                x: r.year,
                y: (r.count / (totals.get(r.year) ?? 1)) * 1_000_000,
                note: grouped.get(w)?.get(r.year)?.title,
              })),
            })),
        )
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [chartWords.join(',')])

  const addWord = () => {
    const w = input.trim().toLowerCase()
    if (!w) return
    setInput('')
    navigate(`/trends?w=${encodeURIComponent([...new Set([...words, w])].slice(0, MAX_WORDS).join(','))}`)
  }

  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">
        How often a word is spoken across all films in the corpus, per million words of dialogue, by release year.
      </p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addWord()
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={words.length ? 'Add another word…' : 'Type a word, e.g. love'}
          aria-label="Word to chart"
          className="w-64 border-2 border-ink bg-card px-3 py-2 font-script placeholder:text-ink-3"
        />
        <button type="submit" className="border-2 border-ink px-4 font-script font-bold uppercase hover:bg-mark">
          Chart it
        </button>
      </form>

      {words.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2" role="list" aria-label="Charted words">
          {words.map((w, i) => (
            <button
              key={w}
              onClick={() => navigate(`/trends?w=${encodeURIComponent(words.filter((x) => x !== w).join(','))}`)}
              className="flex items-center gap-1.5 border-2 border-ink bg-card px-2.5 py-1 font-script text-sm hover:bg-paper-2"
              title={`Remove “${w}”`}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[i] }} />
              {w} ✕
            </button>
          ))}
        </div>
      )}

      {missing.length > 0 && !featured && (
        <p className="mt-3 font-script text-sm text-s2">
          Not enough data for: {missing.join(', ')} (needs ≥20 uses across the corpus, in years with enough films).
        </p>
      )}
      {error && <ErrorBox message={error} />}
      {loading && <Spinner label="Querying corpus…" />}
      {series && series.length > 0 && !loading && (
        <div className="mt-6 border-2 border-ink bg-card p-4">
          {featured && (
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
              <h2 className="slug text-sm">Featured: {featured.title}</h2>
              <span className="font-script text-xs text-ink-2">a new shift every day — or chart your own word above</span>
            </div>
          )}
          {featured && (
            <div className="mb-3 flex flex-wrap gap-2 font-script text-sm">
              {/* legend built from the drawn series so colors always match,
                  even if a featured word is missing from the dataset */}
              {series.map((s) => (
                <button
                  key={s.name}
                  onClick={() => navigate(`/trends?w=${encodeURIComponent(s.name)}`)}
                  className="flex items-center gap-1.5 border-2 border-ink bg-paper px-2.5 py-0.5 hover:bg-mark"
                  title={`Explore “${s.name}”`}
                >
                  <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <LineChart series={series} yLabel="uses per million words" />
          <p className="mt-2 text-right text-xs text-ink-2">uses per million words of dialogue</p>
          {trimmedYears !== null && (
            <p className="mt-1 text-right font-script text-xs text-ink-3">
              {trimmedYears} hidden — too few films in the corpus for reliable rates
            </p>
          )}
        </div>
      )}
      {words.length > 0 && !loading && !error && (
        // key resets the active tab whenever the word list changes
        <WordDetails key={words.join(',')} words={words} years={plottedYears} topMovies={topMovies} />
      )}
      {featured && !loading && <ShiftStrip />}
      {!words.length && (
        <div className="mt-8 font-script text-sm text-ink-2">
          <p>Or try a classic:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['love', 'war', 'money', 'god', 'phone'].map((w) => (
              <button
                key={w}
                onClick={() => navigate(`/trends?w=${w}`)}
                className="border-2 border-ink bg-card px-3 py-1 hover:bg-mark"
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
