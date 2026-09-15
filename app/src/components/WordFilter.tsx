import { useI18n } from '../i18n'

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

const POS_CODES = ['n', 'v', 'a', 'r', 'x']

const chipCls = (state: PosState | undefined) => {
  const base = 'border-2 px-2 py-0.5'
  if (state === 'include') return `${base} border-ink bg-mark font-bold`
  if (state === 'exclude') return `${base} border-ink-3 text-ink-3 line-through`
  return `${base} border-ink hover:bg-mark`
}

export function WordFilterBar({
  filter,
  onChange,
}: {
  filter: WordFilterState
  onChange: (f: WordFilterState) => void
}) {
  const { t } = useI18n()
  const rotate = (c: string) => onChange({ ...filter, pos: rotatePos(filter.pos, c) })
  const ariaState = (kind: string, state: PosState | undefined) =>
    state === 'include' ? t('ui.wordFilterBar.posStateIncluded', { kind })
      : state === 'exclude' ? t('ui.wordFilterBar.posStateExcluded', { kind })
        : t('ui.wordFilterBar.posStateOff', { kind })
  const included = POS_CODES.filter((c) => filter.pos.get(c) === 'include').map((c) => t('pos.' + c))
  const excluded = POS_CODES.filter((c) => filter.pos.get(c) === 'exclude').map((c) => t('pos.' + c))
  return (
    <div className="mt-3 font-script text-xs">
      <div className="flex flex-wrap items-center gap-2 border-2 border-ink bg-card p-2">
        <div className="flex" role="group" aria-label={t('ui.wordFilterBar.commonnessAriaLabel')}>
          <button
            onClick={() => onChange({ ...filter, common: 'interesting' })}
            aria-pressed={filter.common === 'interesting'}
            className={`border-2 border-ink px-2 py-0.5 ${filter.common === 'interesting' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            {t('ui.wordFilterBar.interestingButton')}
          </button>
          <button
            onClick={() => onChange({ ...filter, common: 'all' })}
            aria-pressed={filter.common === 'all'}
            className={`-ms-0.5 border-2 border-ink px-2 py-0.5 ${filter.common === 'all' ? 'bg-mark font-bold' : 'hover:bg-mark'}`}
          >
            {t('ui.wordFilterBar.allButton')}
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
          {t('ui.wordFilterBar.anyKindButton')}
        </button>
        {POS_CODES.map((c) => {
          const state = filter.pos.get(c)
          const label = t('pos.' + c)
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
          ? t('ui.wordFilterBar.hidingDescription')
          : t('ui.wordFilterBar.showingDescription')}
        {included.length > 0 && t('ui.wordFilterBar.onlyKindsSuffix', { kinds: included.join(', ') })}
        {excluded.length > 0 && t('ui.wordFilterBar.excludingKindsSuffix', { kinds: excluded.join(', ') })}
      </p>
    </div>
  )
}
