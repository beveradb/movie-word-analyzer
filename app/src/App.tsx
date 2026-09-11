import { useRoute } from './lib/route'
import { HomeView } from './views/Home'
import { MovieView } from './views/Movie'
import { TrendsView } from './views/Trends'
import { LeaderboardView } from './views/Leaderboard'
import { CompareView } from './views/Compare'

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
        <nav className="flex gap-1 font-script text-sm font-bold uppercase" aria-label="Sections">
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
      </header>

      <main className="pt-4">
        {section === '' && <HomeView />}
        {section === 'movie' && route.path[1] && <MovieView id={route.path[1]} />}
        {section === 'trends' && <TrendsView />}
        {section === 'leaderboard' && <LeaderboardView />}
        {section === 'compare' && <CompareView />}
      </main>

      <footer className="mt-20 border-t-2 border-ink pt-4 text-xs leading-5 text-ink-2">
        <p className="font-script font-bold uppercase text-ink">Fade out.</p>
        <p className="mt-2">
          Open source:{' '}
          <a className="underline" href="https://github.com/beveradb/movie-word-analyzer">
            github.com/beveradb/movie-word-analyzer
          </a>
          . Only derived word counts are published — no subtitle text is redistributed.
        </p>
        <p className="mt-1">
          Data: Cornell Movie-Dialogs Corpus (Danescu-Niculescu-Mizil &amp; Lee, 2011) · corpus pipeline built on{' '}
          <a className="underline" href="https://opus.nlpl.eu/OpenSubtitles">
            OPUS OpenSubtitles
          </a>{' '}
          (Lison &amp; Tiedemann, 2016), IMDb non-commercial datasets, and{' '}
          <a className="underline" href="https://www.themoviedb.org">
            TMDB
          </a>
          . Non-commercial project.
        </p>
      </footer>
    </div>
  )
}
