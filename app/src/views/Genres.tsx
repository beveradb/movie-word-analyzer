import { useEffect, useState } from 'react'
import { getSignatures } from '../lib/data'
import { navigate } from '../lib/route'
import { ErrorBox, Spinner } from '../components/ui'
import { GenreMotif } from '../components/motifs'

interface GenreCard {
  name: string
  movie_count: number
}

/** Index of every genre study, sorted by film count - the discovery path into
 * the per-genre #/genre/:id pages. */
export function GenresView() {
  const [genres, setGenres] = useState<GenreCard[] | null | undefined>(undefined)

  useEffect(() => {
    getSignatures('genres')
      .then((all) =>
        setGenres(
          Object.entries(all)
            .map(([name, e]) => ({ name, movie_count: e.movie_count }))
            .sort((a, b) => b.movie_count - a.movie_count),
        ),
      )
      .catch(() => setGenres(null))
  }, [])

  if (genres === undefined) return <Spinner label="Loading genres…" />
  if (genres === null)
    return <ErrorBox message="Couldn't load genres." retry={() => navigate('/')} />

  return (
    <div>
      <div className="border-b-2 border-ink pb-2">
        <p className="font-script text-xs uppercase tracking-widest text-ink-2">Browse by</p>
        <h1 className="slug mt-1 text-3xl sm:text-4xl">GENRES</h1>
        <p className="mt-1 font-script text-sm text-ink-2">
          What each genre talks about - {genres.length} studies.
        </p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {genres.map((g) => (
          <button
            key={g.name}
            onClick={() => navigate(`/genre/${encodeURIComponent(g.name)}`)}
            className="flex items-center gap-3 border-2 border-ink bg-card p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <GenreMotif genre={g.name} className="h-10 w-10 shrink-0 text-ink-3" />
            <div className="min-w-0">
              <div className="truncate font-script text-sm font-bold">{g.name}</div>
              <div className="text-xs text-ink-2">{g.movie_count.toLocaleString()} films</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
