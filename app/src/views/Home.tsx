import { useEffect, useState } from 'react'
import type { MovieIndexEntry } from '../lib/data'
import { getMovieIndex } from '../lib/data'
import { navigate } from '../lib/route'
import { MovieSearch, Poster } from '../components/ui'
import { FeaturedChart } from '../components/FeaturedChart'
import { FEATURED, dayIndex } from '../lib/featured'

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
  const [count, setCount] = useState(0)

  useEffect(() => {
    getMovieIndex()
      .then((idx) => {
        setCount(idx.length)
        setFeatured(
          [...idx]
            .sort((a, b) => b.votes - a.votes)
            .slice(0, 60)
            .sort(() => 0.5 - Math.random())
            .slice(0, 8),
        )
      })
      .catch(() => {})
  }, [])

  const today = FEATURED[dayIndex()]

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
                className="border-2 border-ink bg-card text-left transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
              >
                <Poster id={m.id} title={m.title} className="w-full border-b-2 border-ink" />
                <div className="p-2.5">
                  <div className="line-clamp-2 font-script text-sm font-bold leading-snug">{m.title}</div>
                  <div className="mt-1 text-xs text-ink-2">
                    {m.year} · {m.total_words.toLocaleString()} words
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="slug border-b-2 border-ink pb-1 text-sm">Or wander a decade</h2>
        <div className="mt-3 flex flex-wrap gap-2 font-script text-sm font-bold">
          {['1930', '1950', '1970', '1980', '1990', '2000', '2010'].map((d) => (
            <a key={d} href={`#/decade/${d}`} className="border-2 border-ink bg-card px-3 py-1 hover:bg-mark">
              {d}s
            </a>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="slug border-b-2 border-ink pb-1 text-sm">Watch a word move</h2>
        <p className="mb-4 mt-2 text-sm text-ink-2">
          A new shift every day - one word&apos;s rise or fall across the decades.
        </p>
        <FeaturedChart title={today.title} words={today.words} />
      </section>

      <section className="mt-10 border-2 border-ink bg-paper-2 p-4 text-sm text-ink-2">
        <p className="font-script font-bold uppercase text-ink">About this dataset</p>
        <p className="mt-1">
          Covering <strong>{count ? count.toLocaleString() : '30,000+'} English-language films</strong> — every word
          of dialogue from the{' '}
          <a className="underline" href="https://opus.nlpl.eu/datasets/OpenSubtitles">
            OPUS OpenSubtitles corpus
          </a>{' '}
          for movies with at least 1,000 IMDb votes, counted per film. Only word counts are published; no subtitle
          text is redistributed.
        </p>
      </section>
    </div>
  )
}
