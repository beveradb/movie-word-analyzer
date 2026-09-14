import { useEffect, useState } from 'react'
import type { Series } from './LineChart'
import { LineChart } from './LineChart'
import { loadWordSeries } from '../lib/series'
import { FEATURED, dayIndex, stepFeatured } from '../lib/featured'
import { FeaturedNav, SeriesLegend, Spinner } from './ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)', 'var(--color-s4)']

/** Self-contained featured-trend chart for the homepage hero: starts on
 * today's featured shift, steppable with ◀/▶ like the Trends page, charted
 * from word_year.parquet only (no top-movie hover notes). Data loads in an
 * effect so it never blocks first paint; if a query fails the stepper stays
 * so the visitor can move on to a trend that works. */
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

  return (
    <div className="border-2 border-ink bg-card p-4">
      <FeaturedNav
        className="mb-2 border-b-2 border-ink pb-2"
        title={featured.title}
        idx={idx}
        len={FEATURED.length}
        noun="trend"
        onStep={(dir) => setIdx((i) => stepFeatured(i, dir, FEATURED.length))}
      />
      {failed ? (
        <p className="py-8 text-center font-script text-sm text-ink-2">
          Couldn&apos;t chart this one - try the next ▶
        </p>
      ) : series === null ? (
        <Spinner label="Charting a featured shift…" />
      ) : (
        <>
          <SeriesLegend series={series} />
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
