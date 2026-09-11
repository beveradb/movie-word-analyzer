import { useEffect, useMemo, useState } from 'react'
import { lit, pq, q } from '../lib/duck'
import { navigate, useRoute } from '../lib/route'
import { LineChart, type Series } from '../components/LineChart'
import { ErrorBox, Spinner } from '../components/ui'

const COLORS = ['#3e6fa8', '#cc5a2e', '#6b5aa8', '#128a5e']
const MAX_WORDS = 4

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
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (words.length === 0) {
      setSeries(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      q<YearRow>(
        `SELECT word, year, count::DOUBLE AS count FROM ${pq('word_year.parquet')}
         WHERE word IN (${words.map(lit).join(',')}) ORDER BY word, year`,
      ),
      yearTotals(),
    ])
      .then(([rows, totals]) => {
        if (cancelled) return
        const byWord = new Map<string, YearRow[]>()
        rows.forEach((r) => byWord.set(r.word, [...(byWord.get(r.word) ?? []), r]))
        setMissing(words.filter((w) => !byWord.has(w)))
        setSeries(
          words
            .filter((w) => byWord.has(w))
            .map((w, i) => ({
              name: w,
              color: COLORS[i],
              points: byWord
                .get(w)!
                .map((r) => ({ x: r.year, y: (r.count / (totals.get(r.year) ?? 1)) * 1_000_000 })),
            })),
        )
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [words])

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
          className="w-64 border-2 border-ink bg-white px-3 py-2 font-script placeholder:text-ink-3"
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
              className="flex items-center gap-1.5 border-2 border-ink bg-white px-2.5 py-1 font-script text-sm hover:bg-paper-2"
              title={`Remove “${w}”`}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS[i] }} />
              {w} ✕
            </button>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-3 font-script text-sm text-s2">
          Not enough data for: {missing.join(', ')} (needs ≥20 uses across the corpus).
        </p>
      )}
      {error && <ErrorBox message={error} />}
      {loading && <Spinner label="Querying corpus…" />}
      {series && series.length > 0 && !loading && (
        <div className="mt-6 border-2 border-ink bg-white p-4">
          <LineChart series={series} yLabel="uses per million words" />
          <p className="mt-2 text-right text-xs text-ink-2">uses per million words of dialogue</p>
        </div>
      )}
      {!words.length && (
        <div className="mt-8 font-script text-ink-2">
          <p>Try:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['love', 'war', 'money', 'god', 'phone'].map((w) => (
              <button
                key={w}
                onClick={() => navigate(`/trends?w=${w}`)}
                className="border-2 border-ink bg-white px-3 py-1 hover:bg-mark"
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
