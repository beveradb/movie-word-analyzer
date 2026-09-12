/** Word rows carry [word, value, zipf, classes, pos] once the dataset has v2
 * meta; pos is the word's single dominant part of speech (n/v/a/r, or x for
 * names, interjections, contractions and other oddities). Rows without pos
 * (older cached JSON) fall back to their first `classes` letter. */
export type WordRow = [string, number, ...unknown[]]

export interface WordFilterState {
  /** 'interesting' hides everyday English (stopwords + Zipf ≥ 5). */
  common: 'interesting' | 'all'
  /** Parts of speech to show; empty = every kind. */
  pos: Set<string>
}

export const defaultFilter = (): WordFilterState => ({
  common: 'interesting',
  pos: new Set(),
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
  if (f.pos.size > 0 && !f.pos.has(rowPos(row))) return false
  return true
}

const POS_CHIPS: [string, string][] = [
  ['n', 'nouns'],
  ['v', 'verbs'],
  ['a', 'adjectives'],
  ['r', 'adverbs'],
  ['x', 'names & other'],
]

const chipCls = (active: boolean) =>
  `border-2 border-ink px-2 py-0.5 ${active ? 'bg-mark font-bold' : 'hover:bg-mark'}`

export function WordFilterBar({
  filter,
  onChange,
}: {
  filter: WordFilterState
  onChange: (f: WordFilterState) => void
}) {
  const togglePos = (c: string) => {
    const pos = new Set(filter.pos)
    if (pos.has(c)) pos.delete(c)
    else pos.add(c)
    onChange({ ...filter, pos })
  }
  return (
    <div className="mt-3 font-script text-xs">
      <div className="flex flex-wrap items-center gap-2 border-2 border-ink bg-card p-2">
        <div className="flex" role="group" aria-label="Word commonness">
          <button
            onClick={() => onChange({ ...filter, common: 'interesting' })}
            aria-pressed={filter.common === 'interesting'}
            className={chipCls(filter.common === 'interesting')}
          >
            interesting words
          </button>
          <button
            onClick={() => onChange({ ...filter, common: 'all' })}
            aria-pressed={filter.common === 'all'}
            className={`-ml-0.5 ${chipCls(filter.common === 'all')}`}
          >
            all words
          </button>
        </div>
        <span className="text-ink-3" aria-hidden>
          |
        </span>
        <button
          onClick={() => onChange({ ...filter, pos: new Set() })}
          aria-pressed={filter.pos.size === 0}
          className={chipCls(filter.pos.size === 0)}
        >
          any kind
        </button>
        {POS_CHIPS.map(([c, label]) => (
          <button
            key={c}
            onClick={() => togglePos(c)}
            aria-pressed={filter.pos.has(c)}
            className={chipCls(filter.pos.has(c))}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-ink-3">
        {filter.common === 'interesting'
          ? 'hiding everyday English — the ~2,000 most common words (the, know, get…)'
          : 'showing every word, including everyday English'}
        {filter.pos.size > 0 &&
          ` · only ${POS_CHIPS.filter(([c]) => filter.pos.has(c))
            .map(([, l]) => l)
            .join(', ')}`}
      </p>
    </div>
  )
}
