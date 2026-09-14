import { useEffect, useState } from 'react'
import type { Series } from './LineChart'
import { LineChart } from './LineChart'
import { loadWordSeries } from '../lib/series'
import { Spinner } from './ui'

const COLORS = ['var(--color-s1)', 'var(--color-s2)', 'var(--color-s3)', 'var(--color-s4)']

/** Lightweight featured-trend chart for the homepage: one featured shift charted
 * from word_year.parquet only (no top-movie hover notes), with a link into the
 * full Trends page. Deferred in an effect so it never blocks first paint;
 * renders nothing if the query fails, so a data hiccup can't break the page. */
export function FeaturedChart({ title, words }: { title: string; words: string[] }) {
  const [series, setSeries] = useState<Series[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSeries(null)
    setFailed(false)
    loadWordSeries(words, COLORS)
      .then(({ series }) => !cancelled && setSeries(series))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [words.join(',')])

  if (failed) return null
  return (
    <div className="border-2 border-ink bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
        <h2 className="slug text-sm">Featured: {title}</h2>
        <a href="#/trends" className="font-script text-xs underline hover:bg-mark">
          See more trends →
        </a>
      </div>
      {series === null ? (
        <Spinner label="Charting today's featured shift…" />
      ) : (
        <>
          <LineChart series={series} yLabel="uses per million words" />
          <p className="mt-2 text-right text-xs text-ink-2">uses per million words of dialogue</p>
        </>
      )}
    </div>
  )
}
