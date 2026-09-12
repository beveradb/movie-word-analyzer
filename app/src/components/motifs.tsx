/** Hand-drawn-style line motifs for genre/decade pages. Stroke follows text color. */

const P = {
  strokeWidth: 2.2,
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const MOTIFS: Record<string, React.ReactNode> = {
  Horror: (
    <g {...P}>
      <path d="M20 38 C20 16 60 16 60 38 C60 50 52 52 52 58 L28 58 C28 52 20 50 20 38 Z" />
      <circle cx="32" cy="36" r="5" />
      <circle cx="48" cy="36" r="5" />
      <path d="M36 58 l0 5 M40 58 l0 6 M44 58 l0 5" />
    </g>
  ),
  Romance: (
    <g {...P}>
      <path d="M40 60 C10 40 16 18 32 22 C38 24 40 30 40 30 C40 30 42 24 48 22 C64 18 70 40 40 60 Z" />
      <path d="M52 14 l6 -6 M58 20 l8 -4" />
    </g>
  ),
  'Sci-Fi': (
    <g {...P}>
      <ellipse cx="40" cy="40" rx="26" ry="10" />
      <path d="M28 34 C30 22 50 22 52 34" />
      <path d="M22 52 l-4 8 M40 54 l0 9 M58 52 l4 8" />
    </g>
  ),
  Western: (
    <g {...P}>
      <path d="M30 62 L30 26 C30 18 40 18 40 26 L40 44" />
      <path d="M40 34 L40 20 C40 12 50 12 50 20 L50 62" />
      <path d="M22 62 L58 62" />
    </g>
  ),
  Crime: (
    <g {...P}>
      <circle cx="34" cy="34" r="16" />
      <path d="M46 46 L62 62" />
      <path d="M28 34 a6 6 0 0 1 6 -6" />
    </g>
  ),
  Comedy: (
    <g {...P}>
      <path d="M20 26 C20 52 60 52 60 26 C52 30 28 30 20 26 Z" />
      <path d="M30 38 C34 44 46 44 50 38" />
    </g>
  ),
  Drama: (
    <g {...P}>
      <path d="M20 50 C20 24 60 24 60 50 C52 46 28 46 20 50 Z" />
      <path d="M30 38 C34 32 46 32 50 38" />
    </g>
  ),
  Action: (
    <g {...P}>
      <path d="M40 12 L46 30 L64 28 L50 40 L60 58 L42 48 L32 64 L32 44 L14 40 L32 34 Z" />
    </g>
  ),
  War: (
    <g {...P}>
      <path d="M40 12 L46 30 L64 28 L50 40 L60 58 L42 48 L32 64 L32 44 L14 40 L32 34 Z" />
    </g>
  ),
  Fantasy: (
    <g {...P}>
      <path d="M18 62 L54 26" />
      <path d="M54 26 l4 -12 l4 12 l12 4 l-12 4 l-4 12 l-4 -12 l-12 -4 Z" />
    </g>
  ),
  Musical: (
    <g {...P}>
      <path d="M30 54 L30 18 L58 12 L58 48" />
      <circle cx="24" cy="54" r="7" />
      <circle cx="52" cy="48" r="7" />
    </g>
  ),
}
MOTIFS.Thriller = MOTIFS.Action
MOTIFS.Music = MOTIFS.Musical
MOTIFS.Mystery = MOTIFS.Crime
MOTIFS.Adventure = MOTIFS.Fantasy

const DEFAULT_MOTIF = (
  <g {...P}>
    <rect x="14" y="26" width="52" height="36" rx="3" />
    <path d="M14 36 L66 36 M14 26 L22 14 M26 26 L34 14 M38 26 L46 14 M50 26 L58 14 M62 26 L66 20" />
  </g>
)

export function GenreMotif({ genre, className }: { genre: string; className?: string }) {
  return (
    <svg viewBox="0 0 80 76" className={className} aria-hidden="true">
      {MOTIFS[genre] ?? DEFAULT_MOTIF}
    </svg>
  )
}

/** Decade motif: a strip of film with the decade's two digits punched in. */
export function DecadeMotif({ decade, className }: { decade: string; className?: string }) {
  const two = decade.slice(2, 4)
  return (
    <svg viewBox="0 0 120 76" className={className} aria-hidden="true">
      <g {...P}>
        <rect x="6" y="14" width="108" height="48" rx="4" />
        {[18, 38, 58, 78, 98].map((x) => (
          <g key={x}>
            <rect x={x} y="19" width="7" height="5" rx="1.5" />
            <rect x={x} y="52" width="7" height="5" rx="1.5" />
          </g>
        ))}
      </g>
      <text
        x="60"
        y="47"
        textAnchor="middle"
        fontFamily="Courier Prime, monospace"
        fontWeight="bold"
        fontSize="26"
        fill="currentColor"
      >
        ’{two}
      </text>
    </svg>
  )
}
