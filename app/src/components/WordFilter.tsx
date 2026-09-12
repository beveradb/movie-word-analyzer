import { useState } from 'react'

/** Word rows may carry [word, value, zipf, classes] once the dataset has meta;
 * older two-element rows pass every filter. classes: n/v/a/r + x (names/other). */
export type WordRow = [string, number, ...unknown[]]

export interface WordFilterState {
  hideCommon: boolean
  pos: Set<string>
}

export const emptyFilter = (): WordFilterState => ({ hideCommon: false, pos: new Set() })

const COMMON_ZIPF = 5.0 // "the/get/know" tier; jellicle is 1.3, macavity 0

export function passesFilter(row: WordRow, f: WordFilterState): boolean {
  const zipf = typeof row[2] === 'number' ? row[2] : null
  const classes = typeof row[3] === 'string' ? row[3] : null
  if (f.hideCommon && zipf !== null && zipf >= COMMON_ZIPF) return false
  if (f.pos.size > 0 && classes !== null && ![...classes].some((c) => f.pos.has(c))) return false
  return true
}

const POS_CHIPS: [string, string][] = [
  ['n', 'nouns'],
  ['v', 'verbs'],
  ['a', 'adjectives'],
  ['r', 'adverbs'],
  ['x', 'names & oddities'],
]

export function WordFilterBar({
  filter,
  onChange,
}: {
  filter: WordFilterState
  onChange: (f: WordFilterState) => void
}) {
  const [open, setOpen] = useState(false)
  const active = filter.hideCommon || filter.pos.size > 0
  const togglePos = (c: string) => {
    const pos = new Set(filter.pos)
    if (pos.has(c)) pos.delete(c)
    else pos.add(c)
    onChange({ ...filter, pos })
  }
  return (
    <div className="mt-3 font-script text-xs">
      <button
        onClick={() => setOpen(!open)}
        className={`border-2 border-ink px-2 py-1 font-bold uppercase ${active ? 'bg-mark' : 'hover:bg-mark'}`}
      >
        Filter words {active ? '●' : ''}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-2 border-ink bg-card p-2">
          <button
            onClick={() => onChange({ ...filter, hideCommon: !filter.hideCommon })}
            aria-pressed={filter.hideCommon}
            className={`border-2 border-ink px-2 py-0.5 ${filter.hideCommon ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            hide everyday words
          </button>
          <span className="text-ink-3">|</span>
          {POS_CHIPS.map(([c, label]) => (
            <button
              key={c}
              onClick={() => togglePos(c)}
              aria-pressed={filter.pos.has(c)}
              className={`border-2 border-ink px-2 py-0.5 ${filter.pos.has(c) ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
            >
              {label}
            </button>
          ))}
          {active && (
            <button onClick={() => onChange(emptyFilter())} className="ml-auto underline">
              clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
