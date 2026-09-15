import { useEffect, useState } from 'react'
import type { FilmSuperlative, Shifts, Superlatives, UbiquityRow, WonderRow } from '../lib/data'
import { getLeaderboard, getShifts, getSuperlatives, getUbiquity, getWonders, getWordlists } from '../lib/data'
import { navigate } from '../lib/route'
import { Sparkline } from './LineChart'
import { ErrorBox, Spinner } from './ui'
import { passesFilter, type WordRow } from './WordFilter'

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
        Words one film says more than the rest of cinema combined - character names, invented words, obsessions.
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
              ({r.year}) - {Math.round(r.share * 100)}% of every time cinema says it
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
  if (!data || data.length === 0) return <Spinner label="Loading…" />
  // derive the corpus size from the data instead of hardcoding it
  const nFilms = Math.round(data[0].films / data[0].share)
  // bars span the visible share range; shares cluster near 100% so an
  // absolute scale would render 50 indistinguishable full-width bars
  const lo = data[data.length - 1].share
  const span = data[0].share - lo || 1
  return (
    <div>
      <p className="mt-1 text-sm text-ink-2">
        Beyond pure connectives, these words appear in almost every one of the {nFilms.toLocaleString()} films.
      </p>
      <ol className="mt-5 max-w-xl">
        {data.map((r: UbiquityRow, i: number) => (
          <li key={r.word} className="flex items-center gap-3 py-1">
            <span className="w-6 shrink-0 text-right font-script text-xs text-ink-3">{i + 1}</span>
            {wordBtn(r.word, 'w-28 truncate')}
            <div
              className="h-4 min-w-1 rounded-r-[4px] bg-s3"
              style={{ width: `${(((r.share - lo) / span) * 0.9 + 0.1) * 100}%` }}
            />
            <span className="ml-1 shrink-0 font-script text-xs tabular-nums text-ink-2">
              {(r.share * 100).toFixed(1)}% of films
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** One overview card: a top-5 taster with a link to its full board. */
function TasterCard({ title, blurb, href, children }: { title: string; blurb?: string; href: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-ink bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 border-b-2 border-ink pb-1">
        <h2 className="slug text-sm">{title}</h2>
        <a href={href} className="shrink-0 font-script text-xs underline hover:bg-mark">
          see all →
        </a>
      </div>
      {blurb && <p className="mt-1 text-xs text-ink-2">{blurb}</p>}
      {children}
    </section>
  )
}

const filmList = (rows: FilmSuperlative[], fmt: (v: number) => string) => (
  <ol className="mt-2">
    {rows.slice(0, 5).map((r, i) => (
      <li key={r.id} className="flex items-baseline gap-2 border-b border-paper-2 py-1 font-script text-sm">
        <span className="w-5 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
        <a href={`#/movie/${r.id}`} className="min-w-0 flex-1 truncate hover:bg-mark">
          {r.title} <span className="text-xs text-ink-2">({r.year})</span>
        </a>
        <span className="shrink-0 text-xs tabular-nums text-ink-2">{fmt(r.value)}</span>
      </li>
    ))}
  </ol>
)

/** Overview: the corpus's headlines - a top-5 taster of every board, all from
 * pre-baked JSON so the default leaderboard view needs no analytics engine. */
export function OverviewBoard() {
  const shifts = useBoard(getShifts)
  const films = useBoard(getSuperlatives)
  const wonders = useBoard(getWonders)
  const ubiquity = useBoard(getUbiquity)
  const [adjectives, setAdjectives] = useState<[string, number][] | null>(null)

  useEffect(() => {
    Promise.all([getLeaderboard(), getWordlists()])
      .then(([lb, wl]) => {
        const stop = new Set(wl.stopwords)
        setAdjectives(
          lb.words
            .filter((r) =>
              passesFilter(
                [r[0], r[1], r[3], r[4], r[5]] as WordRow,
                { common: 'interesting', pos: new Map([['a', 'include']]) },
                stop,
              ),
            )
            .slice(0, 5)
            .map((r) => [r[0], r[1] as number]),
        )
      })
      .catch(() => setAdjectives([]))
  }, [])

  const error = shifts.error ?? films.error
  if (error) return <ErrorBox message={error} />
  if (!shifts.data || !films.data) return <Spinner label="Loading the headlines…" />

  const shiftList = (rows: Shifts['risers'], color: string) => (
    <ol className="mt-2">
      {rows.slice(0, 5).map((r, i) => (
        <li key={r.word} className="flex items-center gap-2 border-b border-paper-2 py-1">
          <span className="w-5 shrink-0 text-right font-script text-xs text-ink-3">{i + 1}</span>
          {wordBtn(r.word, 'w-24 truncate sm:w-28')}
          <Sparkline points={r.rates} color={color} width={70} />
          <span className="ml-auto shrink-0 font-script text-xs tabular-nums text-ink-2">{ratio(r.score)}</span>
        </li>
      ))}
    </ol>
  )

  const maxAdj = adjectives?.[0]?.[1] ?? 1

  return (
    <div>
      <p className="mt-3 text-sm text-ink-2">
        The corpus&apos;s headlines - the top five from every board. Follow any card for the full
        list, filters, and more.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TasterCard title="On the rise" blurb="said far more now than in early cinema" href="#/leaderboard?b=shifts">
          {shiftList(shifts.data.risers, 'var(--color-s1)')}
        </TasterCard>
        <TasterCard title="Fading out" blurb="said far less now than in early cinema" href="#/leaderboard?b=shifts">
          {shiftList(shifts.data.fallers, 'var(--color-s2)')}
        </TasterCard>
        {SUPERLATIVE_SECTIONS.map(([key, title, blurb, fmt]) => (
          <TasterCard key={key} title={title} blurb={blurb} href="#/leaderboard?b=films">
            {filmList(films.data?.[key] ?? [], fmt)}
          </TasterCard>
        ))}
        {adjectives && adjectives.length > 0 && (
          <TasterCard title="Adjectives of cinema" blurb="the most spoken interesting adjectives" href="#/leaderboard?b=words&pos=a">
            <ol className="mt-2">
              {adjectives.map(([w, count], i) => (
                <li key={w} className="flex items-center gap-2 border-b border-paper-2 py-1">
                  <span className="w-5 shrink-0 text-right font-script text-xs text-ink-3">{i + 1}</span>
                  {wordBtn(w, 'w-24 truncate')}
                  <div className="h-3.5 min-w-1 rounded-r-[4px] bg-s4" style={{ width: `${(count / maxAdj) * 45}%` }} />
                  <span className="ml-auto shrink-0 font-script text-xs tabular-nums text-ink-2">
                    {count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </TasterCard>
        )}
        {wonders.data && (
          <TasterCard title="One-film wonders" blurb="words one film owns" href="#/leaderboard?b=wonders">
            <ol className="mt-2">
              {wonders.data.slice(0, 5).map((r, i) => (
                <li key={r.word} className="flex items-baseline gap-2 border-b border-paper-2 py-1 font-script text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
                  {wordBtn(r.word, 'font-bold')}
                  <a href={`#/movie/${r.id}`} className="min-w-0 flex-1 truncate text-right text-xs text-ink-2 underline hover:bg-mark">
                    {r.title}
                  </a>
                </li>
              ))}
            </ol>
          </TasterCard>
        )}
        {ubiquity.data && ubiquity.data.length > 0 && (
          <TasterCard title="Said by every film" blurb="words almost no script skips" href="#/leaderboard?b=everywhere">
            <ol className="mt-2">
              {ubiquity.data.slice(0, 5).map((r, i) => (
                <li key={r.word} className="flex items-baseline gap-2 border-b border-paper-2 py-1 font-script text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
                  {wordBtn(r.word)}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-2">
                    {(r.share * 100).toFixed(1)}% of films
                  </span>
                </li>
              ))}
            </ol>
          </TasterCard>
        )}
      </div>
    </div>
  )
}
