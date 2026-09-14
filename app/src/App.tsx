import { useState } from 'react'
import { useRoute } from './lib/route'
import { HomeView } from './views/Home'
import { MovieView } from './views/Movie'
import { TrendsView } from './views/Trends'
import { LeaderboardView } from './views/Leaderboard'
import { CompareView } from './views/Compare'
import { EntityView } from './views/Entity'

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to day mode' : 'Switch to night mode'}
      title={dark ? 'Day shoot' : 'Night shoot'}
      className="border-2 border-ink px-2.5 py-1 font-script text-sm font-bold hover:bg-mark"
    >
      {dark ? 'DAY' : 'NIGHT'}
    </button>
  )
}

const TABS = [
  { hash: '#/', label: 'Explore', match: '' },
  { hash: '#/trends', label: 'Trends', match: 'trends' },
  { hash: '#/leaderboard', label: 'Leaderboard', match: 'leaderboard' },
  { hash: '#/compare', label: 'Compare', match: 'compare' },
]

export default function App() {
  const route = useRoute()
  const section = route.path[0] ?? ''

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink py-4">
        <a href="#/" className="font-script text-xl font-bold tracking-tight">
          MOVIE<span className="bg-mark px-0.5">WORDS</span>
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap gap-1 font-script text-sm font-bold uppercase" aria-label="Sections">
            {TABS.map((t) => (
              <a
                key={t.label}
                href={t.hash}
                aria-current={section === t.match ? 'page' : undefined}
                className={`px-3 py-1.5 ${
                  section === t.match ? 'bg-ink text-paper' : 'hover:bg-mark'
                }`}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="pt-4">
        {section === '' && <HomeView />}
        {section === 'movie' && route.path[1] && <MovieView id={route.path[1]} />}
        {section === 'trends' && <TrendsView />}
        {section === 'leaderboard' && <LeaderboardView />}
        {section === 'compare' && <CompareView />}
        {section === 'decade' && route.path[1] && <EntityView kind="decade" id={route.path[1]} />}
        {section === 'genre' && route.path[1] && <EntityView kind="genre" id={decodeURIComponent(route.path[1])} />}
      </main>

      <footer className="mt-20 border-t-2 border-ink pt-4 text-xs leading-5 text-ink-2">
        <p className="font-script font-bold uppercase text-ink">Explore the data yourself.</p>
        <p className="mt-2">
          The full dataset is five Parquet files on a public bucket - see{' '}
          <a
            className="underline"
            href="https://github.com/beveradb/movie-word-analyzer/blob/main/docs/DATA.md"
          >
            the data guide
          </a>{' '}
          for download links, schema, and ready-to-run DuckDB queries (
          <a className="underline" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
            CC BY-NC-SA 4.0
          </a>
          ).
        </p>

        <p className="mt-4 font-script font-bold uppercase text-ink">Got an idea?</p>
        <p className="mt-2">
          There must be interesting analyses we haven&apos;t thought of! If you want to share an
          idea or have built something cool with the data,{' '}
          <a className="underline" href="mailto:andrew@beveridge.uk?subject=Movie%20Words%20idea">
            email andrew@beveridge.uk
          </a>
        </p>

        <p className="mt-4 font-script font-bold uppercase text-ink">Credits.</p>
        <p className="mt-2">
          Open source:{' '}
          <a className="underline" href="https://github.com/beveradb/movie-word-analyzer">
            github.com/beveradb/movie-word-analyzer
          </a>{' '}
          and non-commercial. Only derived word counts are published - no subtitle text is
          redistributed.
        </p>
        <p className="mt-1">
          Data: word counts from the{' '}
          <a className="underline" href="https://opus.nlpl.eu/datasets/OpenSubtitles">
            OPUS OpenSubtitles corpus
          </a>{' '}
          (Lison &amp; Tiedemann, 2016), via{' '}
          <a className="underline" href="http://www.opensubtitles.org/">
            OpenSubtitles.org
          </a>
          ; film metadata from{' '}
          <a className="underline" href="https://developer.imdb.com/non-commercial-datasets/">
            IMDb
          </a>{' '}
          and{' '}
          <a className="underline" href="https://www.themoviedb.org">
            TMDB
          </a>
          .
        </p>
        <p className="mt-1">
          Made by Andrew Beveridge -{' '}
          <a className="underline" href="https://github.com/beveradb/">
            GitHub
          </a>{' '}
          ·{' '}
          <a className="underline" href="https://www.linkedin.com/in/andrewbeveridge/">
            LinkedIn
          </a>{' '}
          ·{' '}
          <a className="underline" href="https://www.instagram.com/beveradb/">
            Instagram
          </a>{' '}
          - with the original idea by my lovely wife{' '}
          <a className="underline" href="https://lindsaywright.design/">
            Lindsay Wright
          </a>{' '}
          - check out her graphic design portfolio!
        </p>
      </footer>
    </div>
  )
}
