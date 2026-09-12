import { useEffect, useState } from 'react'
import type { FilmSuperlative, Shifts, Superlatives, UbiquityRow, WonderRow } from '../lib/data'
import { getShifts, getSuperlatives, getUbiquity, getWonders } from '../lib/data'
import { navigate } from '../lib/route'
import { Sparkline } from './LineChart'
import { ErrorBox, Spinner } from './ui'

function useBoard<T>(load: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    load()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { data, error }
}

const wordBtn = (w: string, cls = '') => (
  <button
    onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
    className={`text-left font-script hover:bg-mark ${cls}`}
  >
    {w}
  </button>
)

const ratio = (score: number) => {
  const r = Math.pow(2, Math.abs(score))
  const label = r >= 20 ? Math.round(r).toString() : r.toFixed(1).replace(/\.0$/, '')
  return score >= 0 ? `${label}× up` : `${label}× down`
}

/** Risers & fallers: dialogue frequency shifts, 1930s–40s vs 2010s–20s. */
export function ShiftsBoard() {
  const { data, error } = useBoard(getShifts)
  if (error) return <ErrorBox message={error} />
  if (!data) return <Spinner label="Loading shifts…" />
  const col = (title: string, rows: Shifts['risers'], color: string) => (
    <section>
      <h2 className="slug text-sm">{title}</h2>
      <ol className="mt-3">
        {rows.slice(0, 25).map((r, i) => (
          <li key={r.word} className="flex items-center gap-2 border-b border-paper-2 py-1">
            <span className="w-6 shrink-0 text-right font-script text-xs text-ink-3">{i + 1}</span>
            {wordBtn(r.word, 'w-28 truncate sm:w-32')}
            <Sparkline points={r.rates} color={color} width={90} />
            <span className="ml-auto shrink-0 font-script text-xs tabular-nums text-ink-2">{ratio(r.score)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">
        How dialogue changed: words said far more (or far less) per million words now (2010s–20s) than in early
        cinema (1930s–40s). Lines trace each decade; click a word for the full chart.
      </p>
      <div className="mt-5 grid gap-10 md:grid-cols-2">
        {col('On the rise', data.risers, 'var(--color-s1)')}
        {col('Fading out', data.fallers, 'var(--color-s2)')}
      </div>
    </div>
  )
}

const SUPERLATIVE_SECTIONS: [keyof Superlatives, string, string, (v: number) => string][] = [
  ['chattiest', 'Fastest talkers', 'most words per minute of runtime', (v) => `${v} w/min`],
  ['vocabulary', 'Biggest vocabularies', 'most distinct words in one script', (v) => `${v.toLocaleString()} words`],
  ['sweariest', 'Sweariest scripts', 'profanity per 1,000 words', (v) => `${v}/1k`],
  ['repetitive', 'Most repetitive scripts', 'lowest share of distinct words', (v) => `${v}% unique`],
]

/** Film superlatives: chattiest, biggest vocabulary, sweariest, most repetitive. */
export function FilmsBoard() {
  const { data, error } = useBoard(getSuperlatives)
  if (error) return <ErrorBox message={error} />
  if (!data) return <Spinner label="Loading film superlatives…" />
  const list = (rows: FilmSuperlative[], fmt: (v: number) => string) => (
    <ol className="mt-3">
      {rows.slice(0, 10).map((r, i) => (
        <li key={`${r.id}`} className="flex items-baseline gap-2 border-b border-paper-2 py-1 font-script">
          <span className="w-6 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
          <a href={`#/movie/${r.id}`} className="min-w-0 flex-1 truncate hover:bg-mark">
            {r.title} <span className="text-xs text-ink-2">({r.year})</span>
          </a>
          <span className="shrink-0 text-xs tabular-nums text-ink-2">{fmt(r.value)}</span>
        </li>
      ))}
    </ol>
  )
  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">The record-holders of the corpus, four categories of extreme scripts.</p>
      <div className="mt-5 grid gap-x-10 gap-y-8 md:grid-cols-2">
        {SUPERLATIVE_SECTIONS.map(([key, title, blurb, fmt]) => (
          <section key={key}>
            <h2 className="slug text-sm">{title}</h2>
            <p className="mt-0.5 text-xs text-ink-2">{blurb}</p>
            {list(data[key] ?? [], fmt)}
          </section>
        ))}
      </div>
    </div>
  )
}

/** One-film wonders: words a single film owns. */
export function WondersBoard() {
  const { data, error } = useBoard(getWonders)
  if (error) return <ErrorBox message={error} />
  if (!data) return <Spinner label="Loading one-film wonders…" />
  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">
        Words one film says more than the rest of cinema combined — character names, invented words, obsessions.
      </p>
      <ol className="mt-5">
        {data.map((r: WonderRow, i: number) => (
          <li key={r.word} className="flex flex-wrap items-baseline gap-x-2 border-b border-paper-2 py-1.5 font-script">
            <span className="w-6 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
            {wordBtn(r.word, 'font-bold')}
            <span className="text-sm text-ink-2">
              said {r.count.toLocaleString()}× in{' '}
              <a href={`#/movie/${r.id}`} className="underline hover:bg-mark">
                {r.title}
              </a>{' '}
              ({r.year}) — {Math.round(r.share * 100)}% of every time cinema says it
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Ubiquity: the words (nearly) every film says. */
export function UbiquityBoard() {
  const { data, error } = useBoard(getUbiquity)
  if (error) return <ErrorBox message={error} />
  if (!data) return <Spinner label="Loading…" />
  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">
        Beyond pure connectives, these words appear in almost every one of the 18,761 films.
      </p>
      <ol className="mt-5 max-w-xl">
        {data.map((r: UbiquityRow, i: number) => (
          <li key={r.word} className="flex items-center gap-3 py-1">
            <span className="w-6 shrink-0 text-right font-script text-xs text-ink-3">{i + 1}</span>
            {wordBtn(r.word, 'w-28 truncate')}
            <div className="h-4 min-w-1 rounded-r-[4px] bg-s3" style={{ width: `${(r.share - 0.9) * 900}%` }} />
            <span className="ml-1 shrink-0 font-script text-xs tabular-nums text-ink-2">
              {(r.share * 100).toFixed(1)}% of films
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
