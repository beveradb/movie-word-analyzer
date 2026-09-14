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

/** Era motifs: one hand-drawn icon per decade, an object that says "this era". */
const ERAS: Record<string, React.ReactNode> = {
  // 1910s: hand-crank camera
  '1910': (
    <g {...P}>
      <circle cx="26" cy="18" r="9" />
      <circle cx="46" cy="18" r="9" />
      <rect x="18" y="27" width="36" height="24" rx="3" />
      <path d="M54 34 L66 28 L66 48 L54 42" />
      <path d="M30 51 L26 64 M44 51 L48 64" />
    </g>
  ),
  // 1920s: gramophone horn
  '1920': (
    <g {...P}>
      <path d="M28 46 C20 38 22 20 40 14 C46 26 46 40 40 48" />
      <circle cx="24" cy="52" r="7" />
      <path d="M31 52 L40 48" />
      <path d="M14 62 L58 62" />
    </g>
  ),
  // 1930s: on-air radio microphone
  '1930': (
    <g {...P}>
      <rect x="30" y="10" width="20" height="30" rx="10" />
      <path d="M34 18 L46 18 M34 26 L46 26 M34 34 L46 34" />
      <path d="M24 30 C24 46 56 46 56 30" />
      <path d="M40 46 L40 56 M30 62 L50 62 M40 56 L40 62" />
    </g>
  ),
  // 1940s: propeller plane
  '1940': (
    <g {...P}>
      <path d="M12 40 L52 40 C60 40 64 36 64 32 L20 32 Z" />
      <path d="M34 32 L28 18 L36 18 L44 32" />
      <path d="M16 40 L12 52 L20 52 L28 40" />
      <circle cx="64" cy="36" r="3" />
      <path d="M67 30 L67 42" />
    </g>
  ),
  // 1950s: TV set with rabbit ears
  '1950': (
    <g {...P}>
      <rect x="14" y="26" width="52" height="34" rx="5" />
      <rect x="20" y="32" width="30" height="22" rx="2" />
      <path d="M56 36 L60 36 M56 44 L60 44" />
      <path d="M40 26 L28 10 M40 26 L54 12" />
    </g>
  ),
  // 1960s: rocket
  '1960': (
    <g {...P}>
      <path d="M40 8 C50 18 52 38 40 52 C28 38 30 18 40 8 Z" />
      <circle cx="40" cy="26" r="5" />
      <path d="M32 42 L22 52 L32 50 M48 42 L58 52 L48 50" />
      <path d="M36 56 C38 62 42 62 44 56" />
    </g>
  ),
  // 1970s: vinyl record
  '1970': (
    <g {...P}>
      <circle cx="40" cy="38" r="26" />
      <circle cx="40" cy="38" r="17" />
      <circle cx="40" cy="38" r="8" />
      <circle cx="40" cy="38" r="1.5" />
    </g>
  ),
  // 1980s: boombox
  '1980': (
    <g {...P}>
      <rect x="12" y="26" width="56" height="32" rx="4" />
      <circle cx="26" cy="42" r="8" />
      <circle cx="54" cy="42" r="8" />
      <rect x="36" y="38" width="8" height="8" rx="1" />
      <path d="M18 26 L24 14 M62 26 L56 14" />
    </g>
  ),
  // 1990s: brick cell phone
  '1990': (
    <g {...P}>
      <rect x="28" y="20" width="24" height="44" rx="4" />
      <rect x="32" y="26" width="16" height="10" rx="1" />
      <path d="M33 42 L37 42 M39 42 L43 42 M45 42 L47 42 M33 48 L37 48 M39 48 L43 48 M45 48 L47 48 M33 54 L37 54 M39 54 L43 54 M45 54 L47 54" />
      <path d="M34 20 L34 8" />
    </g>
  ),
  // 2000s: flip phone
  '2000': (
    <g {...P}>
      <rect x="28" y="12" width="24" height="24" rx="4" />
      <rect x="32" y="17" width="16" height="14" rx="1" />
      <path d="M28 38 C28 36 52 36 52 38" />
      <rect x="28" y="40" width="24" height="24" rx="4" />
      <path d="M33 46 L47 46 M33 52 L47 52 M33 58 L47 58" />
    </g>
  ),
  // 2010s: smartphone
  '2010': (
    <g {...P}>
      <rect x="27" y="10" width="26" height="54" rx="5" />
      <rect x="31" y="18" width="18" height="36" rx="1" />
      <circle cx="40" cy="59" r="1.5" />
      <path d="M36 14 L44 14" />
    </g>
  ),
  // 2020s: streaming screen, mid-play
  '2020': (
    <g {...P}>
      <rect x="12" y="18" width="56" height="36" rx="4" />
      <path d="M35 27 L49 36 L35 45 Z" />
      <path d="M18 60 L62 60" />
      <path d="M18 48 L34 48" />
    </g>
  ),
}

export function EraMotif({ decade, className }: { decade: string; className?: string }) {
  return (
    <svg viewBox="0 0 80 76" className={className} aria-hidden="true">
      {ERAS[decade] ?? DEFAULT_MOTIF}
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
