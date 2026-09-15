import { describe, expect, it } from 'vitest'
import { logOdds } from './logOdds'

describe('logOdds', () => {
  it('ranks over-represented words first and matches the Python reference', () => {
    const movie = new Map([
      ['a', 50],
      ['b', 10],
      ['c', 3],
    ])
    const corpus = new Map([
      ['a', 100],
      ['b', 900],
      ['c', 50],
      ['d', 8000],
    ])
    const out = logOdds(movie, corpus)
    // 'a' is hugely over-represented vs the corpus -> first
    expect(out[0][0]).toBe('a')
    // z-scores match derive.py:log_odds to 4 dp - printed via:
    // uv run python -c "from moviewords_pipeline.derive import log_odds; print(log_odds({'a':50,'b':10,'c':3},{'a':100,'b':900,'c':50,'d':8000}))"
    // -> [('a', 21.619004529482904), ('c', 2.530385203627453), ('b', 1.0298492984487508)]
    const byWord = Object.fromEntries(out.map(([w, z]) => [w, Number(z.toFixed(4))]))
    expect(byWord.a).toBeCloseTo(21.619, 4)
    expect(byWord.b).toBeCloseTo(1.0298, 4)
    expect(byWord.c).toBeCloseTo(2.5304, 4)
  })

  it('skips words below minCount and words absent from the corpus', () => {
    // corpus includes 'z' so 'y' isn't 100% of the corpus - a corpus made of
    // just the word being tested trips the zero-denominator guard below.
    const out = logOdds(
      new Map([
        ['x', 2],
        ['y', 100],
      ]),
      new Map([
        ['y', 10],
        ['z', 5000],
      ]),
    )
    expect(out.map(([w]) => w)).toEqual(['y']) // x below minCount 3; y present
  })

  it('mirrors the Python zero-denominator guard: skips a word that is the entire movie/corpus', () => {
    // 'a' is 100% of both the movie and the corpus -> denom_movie and
    // denom_corpus collapse to <= 0 with a small alpha0, so the Python
    // implementation skips it rather than dividing by a non-positive number.
    const out = logOdds(new Map([['a', 5]]), new Map([['a', 5]]), { alpha0: 1 })
    expect(out).toEqual([])
  })
})
