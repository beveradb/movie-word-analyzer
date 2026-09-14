import { useMemo, useRef, useState } from 'react'

export interface Series {
  name: string
  color: string
  /** note: extra context rendered under the series row in the tooltip */
  points: { x: number; y: number; note?: string }[]
}

const M = { top: 12, right: 16, bottom: 26, left: 46 }

/** Tiny inline trend line for list rows and compare cards. */
export function Sparkline({
  points,
  width = 110,
  height = 26,
  color = 'var(--color-s1)',
}: {
  points: [number, number][]
  width?: number
  height?: number
  color?: string
}) {
  if (points.length < 2) return null
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const xMin = Math.min(...xs)
  const xSpan = Math.max(...xs) - xMin || 1
  const yMax = Math.max(...ys) || 1
  const path = points
    .map(([x, y]) => `${(((x - xMin) / xSpan) * (width - 2) + 1).toFixed(1)},${(height - 2 - (y / yMax) * (height - 4)).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="shrink-0" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" points={path} />
    </svg>
  )
}

/** Multi-series line chart (SVG) with crosshair + tooltip per the dataviz spec. */
export function LineChart({
  series,
  width = 720,
  height = 300,
  yLabel,
}: {
  series: Series[]
  width?: number
  height?: number
  yLabel: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const { xs, xMin, xMax, yMax } = useMemo(() => {
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b)
    const ys = series.flatMap((s) => s.points.map((p) => p.y))
    return { xs, xMin: Math.min(...xs), xMax: Math.max(...xs), yMax: Math.max(...ys, 1) }
  }, [series])

  if (series.length === 0 || xs.length === 0) return null
  const iw = width - M.left - M.right
  const ih = height - M.top - M.bottom
  const sx = (x: number) => M.left + (xMax === xMin ? iw / 2 : ((x - xMin) / (xMax - xMin)) * iw)
  const sy = (y: number) => M.top + ih - (y / yMax) * ih

  const yTicks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(yMax)))
    const n = yMax / step
    const size = n >= 5 ? step : n >= 2 ? step / 2 : step / 5
    const ticks: number[] = []
    for (let v = 0; v <= yMax * 1.001; v += size) ticks.push(v)
    return ticks
  }, [yMax])

  const xTicks = useMemo(() => {
    const span = xMax - xMin
    const step = span > 60 ? 20 : span > 25 ? 10 : span > 12 ? 5 : 1
    const ticks: number[] = []
    for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) ticks.push(v)
    return ticks.length ? ticks : [xMin]
  }, [xMin, xMax])

  const nearestX = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * width
    let best = xs[0]
    for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(best) - px)) best = x
    return best
  }

  const hover = hoverX !== null && (
    <g>
      <line x1={sx(hoverX)} x2={sx(hoverX)} y1={M.top} y2={M.top + ih} stroke="var(--color-ink-3)" strokeDasharray="3 3" />
      {series.map((s) => {
        const p = s.points.find((p) => p.x === hoverX)
        return p ? (
          <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill={s.color} stroke="var(--color-paper)" strokeWidth={2} />
        ) : null
      })}
    </g>
  )

  const tooltip =
    hoverX !== null
      ? series
          .map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) }))
          .filter((e): e is { s: Series; p: Series['points'][number] } => !!e.p)
      : []

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full select-none"
        role="img"
        aria-label={`${yLabel} by year`}
        onMouseMove={(e) => setHoverX(nearestX(e.clientX))}
        onMouseLeave={() => setHoverX(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--color-grid)" />
            <text x={M.left - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-2)">
              {t >= 1000 ? `${t / 1000}k` : Math.round(t * 10) / 10}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--color-ink-2)">
            {t}
          </text>
        ))}
        <line x1={M.left} x2={width - M.right} y1={M.top + ih} y2={M.top + ih} stroke="var(--color-ink)" strokeWidth={1.5} />
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
          />
        ))}
        {hover}
      </svg>
      {tooltip.length > 0 && (
        <div
          className="pointer-events-none absolute top-2 border-2 border-ink bg-card px-3 py-2 font-script text-xs shadow-[3px_3px_0_0_var(--color-ink)]"
          style={{ left: `${Math.min((sx(hoverX!) / width) * 100, 70)}%` }}
        >
          <div className="font-bold">{hoverX}</div>
          {tooltip.map(({ s, p }) => (
            <div key={s.name} className="mt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />
                <span>{s.name}</span>
                <span className="ml-2 tabular-nums text-ink-2">{Math.round(p.y * 10) / 10}</span>
              </div>
              {p.note && <div className="ml-4 max-w-52 truncate text-ink-3">{p.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
