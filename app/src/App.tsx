import { useState } from 'react'
import { useRoute } from './lib/route'
import { HomeView } from './views/Home'
import { GenresView } from './views/Genres'
import { DecadesView } from './views/Decades'
import { MovieView } from './views/Movie'
import { TrendsView } from './views/Trends'
import { LeaderboardView } from './views/Leaderboard'
import { CompareView } from './views/Compare'
import { EntityView } from './views/Entity'

/** The site mark: a clapperboard whose slate reads as a highlighted line of
 * dialogue. Same geometry as public/favicon.svg, drawn with theme colors. */
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="rotate(-4 32 32)">
        <path d="M6 10 L58 10 L58 24 L6 24 Z" fill="var(--color-ink)" />
        <g fill="var(--color-paper)">
          <path d="M12 10 L20 10 L14 24 L6 24 Z" />
          <path d="M28 10 L36 10 L30 24 L22 24 Z" />
          <path d="M44 10 L52 10 L46 24 L38 24 Z" />
        </g>
        <rect x="6" y="26" width="52" height="30" fill="var(--color-ink)" />
        <rect x="12" y="32" width="32" height="8" rx="3" fill="var(--color-mark)" transform="skewX(-4) translate(1 0)" />
        <rect x="12" y="45" width="22" height="4.5" rx="2.25" fill="var(--color-paper)" opacity="0.85" />
      </g>
    </svg>
  )
}

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
      className="flex items-center gap-1.5 border-2 border-ink px-2.5 py-1 font-script text-sm font-bold hover:bg-mark"
    >
      {dark ? (
        // sun
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
        </svg>
      ) : (
        // moon
        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M20.6 14.6A9 9 0 1 1 9.4 3.4a7.2 7.2 0 1 0 11.2 11.2Z" />
        </svg>
      )}
      {dark ? 'DAY' : 'NIGHT'}
    </button>
  )
}

const TABS = [
  { hash: '#/', label: 'Explore', match: '' },
  { hash: '#/genres', label: 'Genres', match: 'genres' },
  { hash: '#/decades', label: 'Decades', match: 'decades' },
  { hash: '#/trends', label: 'Trends', match: 'trends' },
  { hash: '#/leaderboard', label: 'Leaderboard', match: 'leaderboard' },
  { hash: '#/compare', label: 'Compare', match: 'compare' },
]

export default function App() {
  const route = useRoute()
  const section = route.path[0] ?? ''

  // the Genres/Decades tabs stay lit on a specific study (#/genre/:id, #/decade/:id) too
  const isActive = (t: (typeof TABS)[number]) =>
    section === t.match ||
    (t.match === 'genres' && section === 'genre') ||
    (t.match === 'decades' && section === 'decade')

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink py-4">
        <a href="#/" className="flex items-center gap-2 font-script text-xl font-bold tracking-tight">
          <Logo className="size-7" />
          <span>
            MOVIE<span className="bg-mark px-0.5">WORDS</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap gap-1 font-script text-sm font-bold uppercase" aria-label="Sections">
            {TABS.map((t) => (
              <a
                key={t.label}
                href={t.hash}
                aria-current={isActive(t) ? 'page' : undefined}
                className={`px-3 py-1.5 ${
                  isActive(t) ? 'bg-ink text-paper' : 'hover:bg-mark'
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
        {section === 'genres' && <GenresView />}
        {section === 'decades' && <DecadesView />}
        {section === 'leaderboard' && <LeaderboardView />}
        {section === 'compare' && <CompareView />}
        {section === 'decade' && route.path[1] && <EntityView kind="decade" id={route.path[1]} />}
        {section === 'genre' && route.path[1] && <EntityView kind="genre" id={decodeURIComponent(route.path[1])} />}
      </main>

      <footer className="mt-20 border-t-2 border-ink pt-4 text-xs leading-5 text-ink-2">
        <p className="font-script font-bold uppercase text-ink">Got an idea?</p>
        <p className="mt-2">
          There must be interesting analyses we haven&apos;t thought of! If you want to share an
          idea or have built something cool with the data,{' '}
          <a className="underline" href="mailto:andrew@beveridge.uk?subject=Movie%20Words%20idea">
            email andrew@beveridge.uk
          </a>
        </p>

        <p className="mt-4 font-script font-bold uppercase text-ink">Grab the data.</p>
        <p className="mt-2">
          The full dataset is five Parquet files on a public bucket - see{' '}
          <a
            className="underline"
            href="https://github.com/beveradb/moviewords/blob/main/docs/DATA.md"
          >
            the data guide
          </a>{' '}
          for download links, schema, and ready-to-run DuckDB queries (
          <a className="underline" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
            CC BY-NC-SA 4.0
          </a>
          ). Wondering about methodology, bias, or copyright? Read the{' '}
          <a
            className="underline"
            href="https://github.com/beveradb/moviewords/blob/main/docs/FAQ.md"
          >
            FAQ
          </a>
          .
        </p>

        <p className="mt-4 font-script font-bold uppercase text-ink">Credits.</p>
        <p className="mt-2">
          Open source:{' '}
          <a className="underline" href="https://github.com/beveradb/moviewords">
            github.com/beveradb/moviewords
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
          . Information courtesy of IMDb (
          <a className="underline" href="https://www.imdb.com">
            https://www.imdb.com
          </a>
          ). Used with permission.
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <a href="https://www.themoviedb.org" aria-label="TMDB">
            <img src="/tmdb.svg" alt="TMDB logo" className="inline h-2.5 w-auto align-baseline" />
          </a>{' '}
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <p className="mt-1">
          Posters via TMDB - copyright their respective studios, shown to identify the films
          discussed. Rights holder?{' '}
          <a className="underline" href="mailto:andrew@beveridge.uk?subject=Movie%20Words%20takedown">
            Email a takedown
          </a>{' '}
          and it comes down promptly.
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
