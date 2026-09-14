import { useEffect, useState } from 'react'
import type { MovieDetail, MovieIndexEntry } from '../lib/data'
import { getMovie, getMovieIndex } from '../lib/data'
import { navigate } from '../lib/route'
import { ErrorBox, HighlightWord, Poster, Slug, Spinner } from '../components/ui'
import { WordFilterBar, defaultFilter, passesFilter, type WordRow } from '../components/WordFilter'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-ink bg-card px-4 py-3">
      <div className="font-script text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-ink-2">{label}</div>
    </div>
  )
}

export function MovieView({ id }: { id: string }) {
  const [movie, setMovie] = useState<MovieDetail | null>(null)
  const [meta, setMeta] = useState<MovieIndexEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState(defaultFilter())

  useEffect(() => {
    setMovie(null)
    setError(null)
    getMovie(id)
      .then(setMovie)
      .catch(() => setError(`No movie with id “${id}” in the dataset.`))
    getMovieIndex().then((idx) => setMeta(idx.find((m) => m.id === id) ?? null)).catch(() => {})
  }, [id])

  if (error) return <ErrorBox message={error} retry={() => navigate('/')} />
  if (!movie) return <Spinner label="Loading script…" />

  // 'all words' mode merges the raw head (stopwords included) with the wider
  // stopword-free top list, so mid-list common words stay reachable
  const allRows = filter.common === 'all'
    ? [...new Map([...movie.top, ...movie.top_all].map((r) => [r[0], r])).values()].sort((a, b) => b[1] - a[1])
    : movie.top
  const words = allRows.filter((r) => passesFilter(r as WordRow, filter)).slice(0, 25)
  // signature words are already statistically distinctive - only kind chips
  // apply, not the commonness toggle (log-odds may rightly pick zipf≥5 words)
  const distinctive = movie.distinctive
    .filter((r) => passesFilter(r as WordRow, { ...filter, common: 'all' }))
    .slice(0, 20)
  const sigMax = distinctive.length ? distinctive[0][1] : 1

  return (
    <div>
      <Slug
        text={`${movie.title} - ${movie.year}`}
        right={
          <span>
            {[...new Set(meta?.genres ?? [])].slice(0, 3).map((g, i) => (
              <span key={g}>
                {i > 0 && ' / '}
                <a href={`#/genre/${encodeURIComponent(g)}`} className="hover:bg-mark">
                  {g}
                </a>
              </span>
            ))}
          </span>
        }
      />

      <div className="mt-5 flex gap-4">
        <a
          href={`#/decade/${Math.floor(movie.year / 10) * 10}`}
          className="w-28 shrink-0 sm:w-36"
          title={`More from the ${Math.floor(movie.year / 10) * 10}s`}
        >
          <Poster id={movie.imdb_id} title={movie.title} className="w-full border-2 border-ink" />
        </a>
        <div className="grid flex-1 grid-cols-2 content-start gap-3">
          <Stat label="Words spoken" value={movie.stats.total_words.toLocaleString()} />
          <Stat label="Distinct words" value={movie.stats.unique_words.toLocaleString()} />
          <Stat
            label="Vocabulary richness"
            value={`${((movie.stats.unique_words / movie.stats.total_words) * 100).toFixed(1)}%`}
          />
          <Stat label="IMDb rating" value={meta ? meta.rating.toFixed(1) : '—'} />
        </div>
      </div>

      <WordFilterBar filter={filter} onChange={setFilter} />

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        {/* Signature words lead and get the highlighter - they're the story. */}
        <section>
          <h2 className="slug text-sm">Signature words</h2>
          <p className="mt-1 text-xs text-ink-2">
            Words this film uses far more than movies overall (log-odds vs the whole corpus).
          </p>
          <div className="mt-3">
            {distinctive.map(([w, z]) => (
              <HighlightWord
                key={w}
                word={w}
                count={z}
                max={sigMax}
                display={z.toFixed(1)}
                onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="slug text-sm">Most spoken words</h2>
          <ol className="mt-3 grid grid-cols-2 gap-x-6">
            {words.map(([w, c], i) => (
              <li key={w} className="flex items-baseline gap-2 border-b border-paper-2 py-1.5 font-script">
                <span className="w-5 text-right text-xs text-ink-3">{i + 1}</span>
                <button className="hover:bg-mark" onClick={() => navigate(`/trends?w=${encodeURIComponent(w)}`)}>
                  {w}
                </button>
                <span className="ml-auto text-xs tabular-nums text-ink-2">{c.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="mt-10 flex gap-3">
        <button
          onClick={() => navigate(`/compare?ids=${id}`)}
          className="border-2 border-ink px-4 py-2 font-script font-bold uppercase hover:bg-mark"
        >
          Compare with another film
        </button>
      </div>
    </div>
  )
}
