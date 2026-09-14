import { useEffect, useState } from 'react'
import type { Series } from './LineChart'
import { LineChart } from './LineChart'
import { loadWordSeries } from '../lib/series'
import { navigate } from '../lib/route'
import { FEATURED, dayIndex, stepFeatured } from '../lib/featured'
import { Spinner } from './ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)', 'var(--color-s4)']

/** Self-contained featured-trend chart for the homepage hero: starts on
 * today's featured shift, steppable with ◀/▶ like the Trends page, charted
 * from word_year.parquet only (no top-movie hover notes). Data loads in an
 * effect so it never blocks first paint; if a query fails the card hides,
 * so a data hiccup can't break the page. */
export function FeaturedChart() {
  const [idx, setIdx] = useState(() => dayIndex(FEATURED.length))
  const [series, setSeries] = useState<Series[] | null>(null)
  const [failed, setFailed] = useState(false)
  const featured = FEATURED[idx]

  useEffect(() => {
    let cancelled = false
    setSeries(null)
    setFailed(false)
    loadWordSeries(featured.words, COLORS)
      .then(({ series }) => !cancelled && setSeries(series))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [featured.words.join(',')])

  if (failed) return null
  return (
    <div className="border-2 border-ink bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIdx((i) => stepFeatured(i, -1, FEATURED.length))}
            aria-label="Previous featured trend"
            className="border-2 border-ink px-2 font-script font-bold hover:bg-mark"
          >
            ◀
          </button>
          <button
            onClick={() => setIdx((i) => stepFeatured(i, 1, FEATURED.length))}
            aria-label="Next featured trend"
            className="border-2 border-ink px-2 font-script font-bold hover:bg-mark"
          >
            ▶
          </button>
          <h2 className="slug text-sm">{featured.title}</h2>
        </div>
        <span className="font-script text-xs text-ink-2">
          {idx + 1} of {FEATURED.length}
        </span>
      </div>
      {series === null ? (
        <Spinner label="Charting a featured shift…" />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-2 font-script text-sm">
            {series.map((s) => (
              <button
                key={s.name}
                onClick={() => navigate(`/trends?w=${encodeURIComponent(s.name)}`)}
                className="flex items-center gap-1.5 border-2 border-ink bg-paper px-2 py-0.5 hover:bg-mark"
                title={`Explore "${s.name}"`}
              >
                <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
          <LineChart series={series} yLabel="uses per million words" />
          <p className="mt-1 flex items-baseline justify-between gap-2 text-xs text-ink-2">
            <a href="#/trends" className="font-script underline hover:bg-mark">
              more trends →
            </a>
            <span>uses per million words of dialogue</span>
          </p>
        </>
      )}
    </div>
  )
}
