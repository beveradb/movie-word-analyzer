/** Word rows carry [word, value, zipf, classes, pos] once the dataset has v2
 * meta; pos is the word's single dominant part of speech (n/v/a/r, or x for
 * names, interjections, contractions and other oddities). Rows without pos
 * (older cached JSON) fall back to their first `classes` letter. */
export type WordRow = [string, number, ...unknown[]]

export type PosState = 'include' | 'exclude'

export interface WordFilterState {
  /** 'interesting' hides everyday English (stopwords + Zipf ≥ 5). */
  common: 'interesting' | 'all'
  /** Per-kind include/exclude; absent key = neutral. Empty = every kind. */
  pos: Map<string, PosState>
}

export const defaultFilter = (): WordFilterState => ({
  common: 'interesting',
  pos: new Map(),
})

export const COMMON_ZIPF = 5.0 // "the/get/know" tier; "sheriff" is 4.2

export function rowPos(row: WordRow): string {
  const pos = row[4]
  if (typeof pos === 'string' && pos) return pos
  const classes = row[3]
  if (typeof classes === 'string' && classes) return classes[0] === 's' ? 'a' : classes[0]
  return 'x'
}

export function passesFilter(row: WordRow, f: WordFilterState, stopwords?: Set<string>): boolean {
  if (f.common === 'interesting') {
    const zipf = typeof row[2] === 'number' ? row[2] : 0
    if (zipf >= COMMON_ZIPF || stopwords?.has(row[0])) return false
  }
  if (f.pos.size > 0) {
    const p = rowPos(row)
    if (f.pos.get(p) === 'exclude') return false
    let hasIncludes = false
    for (const v of f.pos.values()) if (v === 'include') { hasIncludes = true; break }
    if (hasIncludes && f.pos.get(p) !== 'include') return false
  }
  return true
}

/** off -> include -> exclude -> off. Returns a new map (never mutates). */
export function rotatePos(pos: Map<string, PosState>, c: string): Map<string, PosState> {
  const next = new Map(pos)
  const cur = next.get(c)
  if (cur === undefined) next.set(c, 'include')
  else if (cur === 'include') next.set(c, 'exclude')
  else next.delete(c)
  return next
}

const POS_CHIPS: [string, string][] = [
  ['n', 'nouns'],
  ['v', 'verbs'],
  ['a', 'adjectives'],
  ['r', 'adverbs'],
  ['x', 'names & other'],
]

const chipCls = (state: PosState | undefined) => {
  const base = 'border-2 px-2 py-0.5'
  if (state === 'include') return `${base} border-ink bg-mark font-bold`
  if (state === 'exclude') return `${base} border-ink-3 text-ink-3 line-through`
  return `${base} border-ink hover:bg-mark`
}

const ariaState = (label: string, state: PosState | undefined) =>
  state === 'include' ? `${label}: included (click to exclude)`
    : state === 'exclude' ? `${label}: excluded (click to reset)`
      : `${label}: off (click to include)`

export function WordFilterBar({
  filter,
  onChange,
}: {
  filter: WordFilterState
  onChange: (f: WordFilterState) => void
}) {
  const rotate = (c: string) => onChange({ ...filter, pos: rotatePos(filter.pos, c) })
  const included = POS_CHIPS.filter(([c]) => filter.pos.get(c) === 'include').map(([, l]) => l)
  const excluded = POS_CHIPS.filter(([c]) => filter.pos.get(c) === 'exclude').map(([, l]) => l)
  return (
    <div className="mt-3 font-script text-xs">
      <div className="flex flex-wrap items-center gap-2 border-2 border-ink bg-card p-2">
        <div className="flex" role="group" aria-label="Word commonness">
          <button
            onClick={() => onChange({ ...filter, common: 'interesting' })}
            aria-pressed={filter.common === 'interesting'}
            className={`border-2 border-ink px-2 py-0.5 ${filter.common === 'interesting' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            interesting words
          </button>
          <button
            onClick={() => onChange({ ...filter, common: 'all' })}
            aria-pressed={filter.common === 'all'}
            className={`-ml-0.5 border-2 border-ink px-2 py-0.5 ${filter.common === 'all' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            all words
          </button>
        </div>
        <span className="text-ink-3" aria-hidden>
          |
        </span>
        <button
          onClick={() => onChange({ ...filter, pos: new Map() })}
          aria-pressed={filter.pos.size === 0}
          className={filter.pos.size === 0 ? 'border-2 border-ink bg-mark px-2 py-0.5 font-bold' : 'border-2 border-ink px-2 py-0.5 hover:bg-mark'}
        >
          any kind
        </button>
        {POS_CHIPS.map(([c, label]) => {
          const state = filter.pos.get(c)
          return (
            <button
              key={c}
              onClick={() => rotate(c)}
              aria-label={ariaState(label, state)}
              className={chipCls(state)}
            >
              {state === 'exclude' ? `− ${label}` : label}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-ink-3">
        {filter.common === 'interesting'
          ? 'hiding everyday English - the ~2,000 most common words (the, know, get…)'
          : 'showing every word, including everyday English'}
        {included.length > 0 && ` · only ${included.join(', ')}`}
        {excluded.length > 0 && ` · hiding ${excluded.join(', ')}`}
      </p>
    </div>
  )
}
