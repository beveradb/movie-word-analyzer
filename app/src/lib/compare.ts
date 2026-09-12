/** Head-to-head word rates between compared entities (films, decades, genres).
 * Pure math over per-entity [word, count] lists so it's unit-testable and
 * needs no WASM: rates are per-million within each entity's own dialogue. */

export interface H2HEntity {
  key: string
  totalWords: number
  /** [word, count] — the entity's most-said words (top500 for decades/genres,
   * merged top lists for movies). */
  words: [string, number][]
}

export interface H2HRow {
  word: string
  /** How many times more often this entity says the word than the closest
   * other entity (min ratio across all others). */
  ratio: number
}

export function headToHead(
  entities: H2HEntity[],
  { minCount = 30, minRatio = 2.5, topN = 10 } = {},
): Map<string, H2HRow[]> {
  const rate = (count: number, total: number) => (count / Math.max(total, 1)) * 1e6
  const maps = entities.map((e) => new Map(e.words))
  // for words absent from an entity's list, assume the biggest count it could
  // have while staying off the list (the list's smallest entry)
  const floors = entities.map((e, i) =>
    rate(e.words.length ? Math.min(...e.words.map(([, c]) => c)) : 0, entities[i].totalWords),
  )

  const out = new Map<string, H2HRow[]>()
  entities.forEach((a, ai) => {
    const rows: H2HRow[] = []
    for (const [word, count] of a.words) {
      if (count < minCount) continue
      const rateA = rate(count, a.totalWords)
      let worst = Infinity
      entities.forEach((b, bi) => {
        if (bi === ai) return
        const cb = maps[bi].get(word)
        const rateB = cb !== undefined ? rate(cb, b.totalWords) : floors[bi]
        worst = Math.min(worst, rateA / Math.max(rateB, 0.01))
      })
      if (worst >= minRatio) rows.push({ word, ratio: Math.round(worst * 10) / 10 })
    }
    rows.sort((x, y) => y.ratio - x.ratio)
    out.set(a.key, rows.slice(0, topN))
  })
  return out
}
