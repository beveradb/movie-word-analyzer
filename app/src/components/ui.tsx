import { useEffect, useMemo, useRef, useState } from 'react'
import type { MovieIndexEntry } from '../lib/data'
import { getMovieIndex } from '../lib/data'

/** Screenplay slug-line header: INT. PULP FICTION — 1994 */
export function Slug({ prefix = 'INT.', text, right }: { prefix?: string; text: string; right?: string }) {
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
  onClick,
}: {
  word: string
  count: number
  max: number
  onClick?: () => void
}) {
  const frac = Math.max(count / max, 0.04)
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-baseline gap-3 rounded px-1 py-0.5 text-left hover:bg-paper-2"
      title={`“${word}” — spoken ${count.toLocaleString()} times`}
    >
      <span className="hl min-w-0 flex-1 font-script text-lg leading-6">
        <span className="hl-mark" style={{ width: `calc(${(frac * 100).toFixed(1)}% + 0.3em)` }} />
        <span className="hl-word">{word}</span>
      </span>
      <span className="ml-auto shrink-0 font-script text-sm text-ink-2 tabular-nums group-hover:text-ink">
        {count.toLocaleString()}
      </span>
    </button>
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
        className="w-full border-2 border-ink bg-white px-3 py-2 font-script text-base placeholder:text-ink-3"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full border-2 border-ink bg-white shadow-[4px_4px_0_0_#201d1a]">
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
                <span className="ml-3 shrink-0 text-sm text-ink-2">{m.year}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
