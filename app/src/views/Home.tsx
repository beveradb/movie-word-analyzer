import { useEffect, useState } from 'react'
import type { MovieIndexEntry } from '../lib/data'
import { getMovieIndex } from '../lib/data'
import { navigate } from '../lib/route'
import { MovieSearch } from '../components/ui'

/** Hero: a line of dialogue with live highlighter marks — the site's thesis. */
function Hero() {
  return (
    <div className="mt-10 sm:mt-16">
      <p className="font-script text-sm uppercase tracking-widest text-ink-2">Fade in:</p>
      <h1 className="mt-3 max-w-2xl font-script text-4xl font-bold leading-tight sm:text-5xl">
        Every film has a<br />
        <span className="hl">
          <span className="hl-mark" style={{ width: 'calc(100% + 0.3em)' }} />
          <span className="hl-word">vocabulary</span>
        </span>
        .
      </h1>
      <p className="mt-4 max-w-xl text-ink-2">
        Movie Words counts every word of dialogue in film subtitles — so you can see what any movie actually says,
        watch words rise and fall across decades, and compare scripts head to head.
      </p>
    </div>
  )
}

export function HomeView() {
  const [featured, setFeatured] = useState<MovieIndexEntry[]>([])

  useEffect(() => {
    getMovieIndex()
      .then((idx) =>
        setFeatured(
          [...idx]
            .sort((a, b) => b.votes - a.votes)
            .slice(0, 60)
            .sort(() => 0.5 - Math.random())
            .slice(0, 8),
        ),
      )
      .catch(() => {})
  }, [])

  return (
    <div>
      <Hero />
      <div className="mt-8 max-w-md">
        <MovieSearch onPick={(m) => navigate(`/movie/${m.id}`)} />
      </div>

      {featured.length > 0 && (
        <section className="mt-10">
          <h2 className="slug border-b-2 border-ink pb-1 text-sm">Pull a script off the shelf</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {featured.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/movie/${m.id}`)}
                className="border-2 border-ink bg-white p-3 text-left transition-transform hover:-translate-y-0.5 hover:bg-mark/30 hover:shadow-[4px_4px_0_0_#201d1a]"
              >
                <div className="line-clamp-2 font-script font-bold leading-snug">{m.title}</div>
                <div className="mt-1 text-xs text-ink-2">
                  {m.year} · {m.total_words.toLocaleString()} words
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 border-2 border-ink bg-paper-2 p-4 text-sm text-ink-2">
        <p className="font-script font-bold uppercase text-ink">About this dataset</p>
        <p className="mt-1">
          Currently showing <strong>610 films</strong> from the{' '}
          <a className="underline" href="https://www.cs.cornell.edu/~cristian/Cornell_Movie-Dialogs_Corpus.html">
            Cornell Movie-Dialogs Corpus
          </a>
          . The full build — ~30,000 films from OpenSubtitles with country and runtime metadata — is in the works;
          the country filter and words-per-minute stats unlock then.
        </p>
      </section>
    </div>
  )
}
