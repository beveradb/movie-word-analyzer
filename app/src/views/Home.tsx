import { useEffect, useState } from 'react'
import type { MovieIndexEntry } from '../lib/data'
import { getMovieIndex } from '../lib/data'
import { navigate } from '../lib/route'
import { MovieSearch, Poster } from '../components/ui'
import { FeaturedChart } from '../components/FeaturedChart'
import { DecadeMotif } from '../components/motifs'

const HOME_DECADES = ['1930', '1950', '1970', '1990', '2010']

/** Hero: the pitch on the left, the product on the right - a live featured
 * trend chart doing the explaining for anyone who won't read or scroll. */
function Hero() {
  return (
    <div className="mt-8 grid items-start gap-8 sm:mt-12 lg:grid-cols-2">
      <div>
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
          Movie Words counts every word of dialogue in film subtitles - so you can see what any movie actually says,
          watch words rise and fall across decades, and compare scripts head to head.
        </p>
        <div className="mt-6 max-w-md">
          <MovieSearch onPick={(m) => navigate(`/movie/${m.id}`)} />
        </div>
      </div>
      <FeaturedChart />
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

  return (
    <div>
      <Hero />

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
        <a
          href="#/decades"
          className="flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-card p-4 transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
        >
          <div>
            <h2 className="slug text-sm">Wander the decades</h2>
            <p className="mt-1 text-sm text-ink-2">
              From the talkies to the 2020s - how each era of cinema talked.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-ink-3">
            {HOME_DECADES.map((d) => (
              <DecadeMotif key={d} decade={d} className="h-9 w-14" />
            ))}
            <span className="font-script text-sm font-bold text-ink">→</span>
          </div>
        </a>
      </section>

      <section className="mt-10 border-2 border-ink bg-paper-2 p-4 text-sm text-ink-2">
        <p className="font-script font-bold uppercase text-ink">About this dataset</p>
        <p className="mt-1">
          Covering <strong>{count ? count.toLocaleString() : '30,000+'} English-language films</strong> - every word
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
