/** Monroe et al. log-odds-ratio with an informative Dirichlet prior from corpus
 * frequencies. Port of pipeline derive.py:log_odds - keep in sync. Returns
 * [word, z] sorted by z descending (most over-represented first). */
export function logOdds(
  movie: Map<string, number>,
  corpus: Map<string, number>,
  opts: { alpha0?: number; minCount?: number; nCorpus?: number } = {},
): [string, number][] {
  const alpha0 = opts.alpha0 ?? 100
  const minCount = opts.minCount ?? 3
  const nMovie = [...movie.values()].reduce((a, b) => a + b, 0)
  const nCorpus = opts.nCorpus ?? [...corpus.values()].reduce((a, b) => a + b, 0)
  const out: [string, number][] = []
  for (const [word, y] of movie) {
    if (y < minCount) continue
    const yC = corpus.get(word) ?? 0
    const prior = nCorpus ? (alpha0 * yC) / nCorpus : 0
    if (prior === 0) continue
    const denomMovie = nMovie + alpha0 - y - prior
    const denomCorpus = nCorpus + alpha0 - yC - prior
    if (denomMovie <= 0 || denomCorpus <= 0) {
      // Degenerate only when a single word accounts for the *entire*
      // movie/corpus word count (e.g. tiny test fixtures, or a language
      // slice with one repeated word) - no real signal to compute a ratio
      // against, so skip rather than divide by <=0.
      continue
    }
    const delta = Math.log((y + prior) / denomMovie) - Math.log((yC + prior) / denomCorpus)
    const variance = 1 / (y + prior) + 1 / (yC + prior)
    out.push([word, delta / Math.sqrt(variance)])
  }
  return out.sort((a, b) => b[1] - a[1])
}
