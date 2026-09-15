import { describe, expect, it } from 'vitest'
import { mergeTrendFiles } from './series'
import type { TrendFile } from './trends'

describe('mergeTrendFiles', () => {
  it('sums line counts exactly and unions top films', () => {
    const es: TrendFile = { line: [[2000, 5], [2001, 3]], top: [['tt_es', 'A', 2000, 5, 900]], byYear: [] }
    const fr: TrendFile = { line: [[2001, 4]], top: [['tt_fr', 'B', 2001, 4, 800]], byYear: [] }
    const out = mergeTrendFiles([es, fr])
    expect(out.line).toEqual([[2000, 5], [2001, 7]])
    expect(out.top.map((t) => t[0])).toEqual(['tt_es', 'tt_fr']) // count desc
  })
})
