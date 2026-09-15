import { useEffect, useMemo, useRef, useState } from 'react'
import type { MovieIndexEntry } from '../lib/data'
import { getMovieIndex } from '../lib/data'
import { navigate } from '../lib/route'
import type { Series } from './LineChart'

/** ◀/▶ header row for a day-rotated featured pool (trends, matchups). */
export function FeaturedNav({
  title,
  idx,
  len,
  onStep,
  noun,
  suffix,
  className = '',
}: {
  title: string
  idx: number
  len: number
  onStep: (dir: 1 | -1) => void
  /** What one item is called in the aria labels, e.g. "trend" or "matchup". */
  noun: string
  suffix?: string
  className?: string
}) {
  const btn = (dir: 1 | -1, glyph: string) => (
    <button
      onClick={() => onStep(dir)}
      aria-label={`${dir === 1 ? 'Next' : 'Previous'} featured ${noun}`}
      className="border-2 border-ink px-2 font-script font-bold hover:bg-mark"
    >
      {glyph}
    </button>
  )
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        {btn(-1, '◀')}
        {btn(1, '▶')}
        <h2 className="slug text-sm">{title}</h2>
      </div>
      <span className="font-script text-xs text-ink-2">
        {idx + 1} of {len}
        {suffix ? ` - ${suffix}` : ''}
      </span>
    </div>
  )
}

/** Clickable chart legend - one chip per drawn series, linking into Trends. */
export function SeriesLegend({ series }: { series: Series[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2 font-script text-sm">
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
  )
}

/** Screenplay slug-line header: INT. PULP FICTION - 1994 */
export function Slug({
  prefix = 'INT.',
  text,
  right,
}: {
  prefix?: string
  text: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="slug flex items-baseline justify-between border-b-2 border-ink pb-1 text-sm sm:text-base">
      <span>
        {prefix} {text}
      </span>
      {right && <span className="text-ink-2">{right}</span>}
    </div>
  )
}

/** The signature element: a word with a highlighter mark scaled to its count. */
export function HighlightWord({
  word,
  count,
  max,
  display,
  onClick,
}: {
  word: string
  count: number
  max: number
  /** Override for the right-hand figure (defaults to the count). */
  display?: string
  onClick?: () => void
}) {
  const frac = Math.max(count / max, 0.04)
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-baseline gap-3 rounded px-1 py-0.5 text-left hover:bg-paper-2"
      title={`“${word}” - ${display ?? `spoken ${count.toLocaleString()} times`}`}
    >
      <span className="hl min-w-0 flex-1 font-script text-lg leading-6">
        <span className="hl-mark" style={{ width: `calc(${(frac * 100).toFixed(1)}% + 0.3em)` }} />
        <span className="hl-word">{word}</span>
      </span>
      <span className="ml-auto shrink-0 font-script text-sm text-ink-2 tabular-nums group-hover:text-ink">
        {display ?? count.toLocaleString()}
      </span>
    </button>
  )
}

/** "translated" marker for non-English originals - shown for any film whose
 * original language isn't English, regardless of the active language filter. */
export function LangBadge({ lang, className = '' }: { lang?: string; className?: string }) {
  if (!lang || lang === 'en') return null
  let name = lang.toUpperCase()
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? name
  } catch {
    // unknown/invalid code: keep the raw code
  }
  return (
    <span
      className={`shrink-0 border border-ink-2 px-1 text-[10px] uppercase tracking-wide text-ink-2 ${className}`}
      title={`Original language ${name} - counts come from the English translated subtitles`}
    >
      translated · {name}
    </span>
  )
}

const POSTER_BASE = 'https://data.moviewords.org/posters'

/** Movie poster from our R2 bucket, falling back to a script-cover placeholder. */
export function Poster({ id, title, className }: { id: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <div
        className={`flex aspect-[2/3] items-center justify-center bg-paper-2 p-2 text-center font-script text-xs font-bold uppercase leading-tight text-ink-2 ${className ?? ''}`}
      >
        {title}
      </div>
    )
  return (
    <img
      src={`${POSTER_BASE}/${id}.jpg`}
      alt={`${title} poster`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`aspect-[2/3] object-cover ${className ?? ''}`}
    />
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-ink-2">
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-ink-3 border-t-ink" />
      <span className="font-script text-sm uppercase tracking-wide">{label}</span>
    </div>
  )
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="my-6 border-2 border-s2 bg-paper-2 p-4 font-script text-sm">
      <p className="font-bold uppercase">Scene missing</p>
      <p className="mt-1 text-ink-2">{message}</p>
      {retry && (
        <button onClick={retry} className="mt-3 border-2 border-ink px-3 py-1 font-bold uppercase hover:bg-mark">
          Retry
        </button>
      )}
    </div>
  )
}

/** Debounced movie search over the small client-side index. */
export function MovieSearch({
  placeholder = 'Search a movie title…',
  onPick,
  autoFocus,
}: {
  placeholder?: string
  onPick: (m: MovieIndexEntry) => void
  autoFocus?: boolean
}) {
  const [index, setIndex] = useState<MovieIndexEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getMovieIndex().then(setIndex).catch(() => setIndex([]))
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const hits = useMemo(() => {
    if (!index || query.trim().length < 2) return []
    const needle = query.trim().toLowerCase()
    return index
      .filter((m) => m.title.toLowerCase().includes(needle))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 8)
  }, [index, query])

  return (
    <div ref={boxRef} className="relative">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label="Search movies"
        className="w-full border-2 border-ink bg-card px-3 py-2 font-script text-base placeholder:text-ink-3"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full border-2 border-ink bg-card shadow-[4px_4px_0_0_var(--color-ink)]">
          {hits.map((m) => (
            <li key={m.id}>
              <button
                className="flex w-full items-baseline justify-between px-3 py-2 text-left font-script hover:bg-mark"
                onClick={() => {
                  onPick(m)
                  setQuery('')
                  setOpen(false)
                }}
              >
                <span className="truncate">{m.title}</span>
                <span className="ml-3 flex shrink-0 items-baseline gap-1.5">
                  <LangBadge lang={m.lang} />
                  <span className="text-sm text-ink-2">{m.year}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
