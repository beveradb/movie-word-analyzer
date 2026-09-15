import { logOdds } from './logOdds'
import type {
  Leaderboard, SignatureEntry, Superlatives, WonderRow, UbiquityRow, Shifts, FilmSuperlative,
} from './data'

/** Sum count (col 1) + movie_count (col 2) by word (col 0) across slices;
 * keep later columns (meta) from the first sighting; re-sort by count desc. */
export function mergeWordRows<T extends [string, number, number, ...unknown[]]>(
  parts: T[][], topN: number,
): T[] {
  const by = new Map<string, T>()
  for (const rows of parts) {
    for (const row of rows) {
      const cur = by.get(row[0])
      if (!cur) by.set(row[0], [...row] as T)
      else { cur[1] += row[1]; cur[2] += row[2] }
    }
  }
  return [...by.values()].sort((a, b) => b[1] - a[1]).slice(0, topN)
}

export function mergeLeaderboard(parts: Leaderboard[]): Leaderboard {
  return {
    words: mergeWordRows(parts.map((p) => p.words), 1000),
    stopwords: mergeWordRows(parts.map((p) => p.stopwords), 50),
  }
}

export function mergeYearTotals(parts: Map<number, number>[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const m of parts) for (const [y, t] of m) out.set(y, (out.get(y) ?? 0) + t)
  return out
}

export function mergeTrendLines(parts: [number, number][][]): [number, number][] {
  const out = new Map<number, number>()
  for (const line of parts) for (const [y, c] of line) out.set(y, (out.get(y) ?? 0) + c)
  return [...out.entries()].sort((a, b) => a[0] - b[0])
}

export function mergeTopFilms<T extends { count: number }>(parts: T[][], topN: number): T[] {
  return parts.flat().sort((a, b) => b.count - a.count).slice(0, topN)
}

const rankFilms = (parts: FilmSuperlative[][], topN = 20): FilmSuperlative[] =>
  parts.flat().sort((a, b) => b.value - a.value).slice(0, topN)

export function mergeSuperlatives(parts: Superlatives[]): Superlatives {
  return {
    chattiest: rankFilms(parts.map((p) => p.chattiest)),
    vocabulary: rankFilms(parts.map((p) => p.vocabulary)),
    sweariest: rankFilms(parts.map((p) => p.sweariest)),
    repetitive: rankFilms(parts.map((p) => p.repetitive)),
  }
}

export function mergeWonders(parts: WonderRow[][]): WonderRow[] {
  // one-film wonders are per-film facts; union then re-rank by share desc
  return parts.flat().sort((a, b) => b.share - a.share).slice(0, 50)
}

export function mergeUbiquity(parts: UbiquityRow[][]): UbiquityRow[] {
  // ubiquity = films-appeared / total; sum films, keep max share (head-accurate)
  const by = new Map<string, UbiquityRow>()
  for (const rows of parts) for (const r of rows) {
    const cur = by.get(r.word)
    if (!cur) by.set(r.word, { ...r })
    else { cur.films += r.films; cur.share = Math.max(cur.share, r.share) }
  }
  return [...by.values()].sort((a, b) => b.films - a.films).slice(0, 200)
}

export function mergeShifts(parts: Shifts[]): Shifts {
  // rate-delta board: single-language is exact; multi-language unions the
  // risers/fallers and re-ranks by the pre-computed score (head-accurate).
  const decades = [...new Set(parts.flatMap((p) => p.decades))].sort((a, b) => a - b)
  const top = (key: 'risers' | 'fallers') =>
    parts.flatMap((p) => p[key]).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 30)
  return { decades, risers: top('risers'), fallers: top('fallers') }
}

export function mergeSignatures(
  parts: Record<string, SignatureEntry>[],
): Record<string, SignatureEntry> {
  const keys = new Set(parts.flatMap((p) => Object.keys(p)))
  const out: Record<string, SignatureEntry> = {}
  // reference corpus for the recompute: the summed top-word counts across every
  // entity in every slice (head-accurate - see spec's multi-select decision)
  const corpus = new Map<string, number>()
  for (const p of parts) for (const e of Object.values(p))
    for (const [w, c] of e.top) corpus.set(w, (corpus.get(w) ?? 0) + c)
  for (const key of keys) {
    const entries = parts.map((p) => p[key]).filter(Boolean)
    const top = new Map<string, number>()
    for (const e of entries) for (const [w, c] of e.top) top.set(w, (top.get(w) ?? 0) + c)
    const topArr = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100) as [string, number][]
    out[key] = {
      movie_count: entries.reduce((s, e) => s + e.movie_count, 0),
      total_words: entries.reduce((s, e) => s + e.total_words, 0),
      top: topArr,
      signature: logOdds(top, corpus, { minCount: 20 }).slice(0, 100)
        .map(([w, z]) => [w, Number(z.toFixed(2))]) as [string, number][],
    }
  }
  return out
}
