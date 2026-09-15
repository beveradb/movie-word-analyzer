// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); localStorage.clear() })

async function withLangs(langs: string[]) {
  if (langs.length) localStorage.setItem('langs', langs.join(','))
  return await import('./data')
}

describe('fetchLangMerged', () => {
  it('0 languages fetches the global all/ file, no merge', async () => {
    const data = await withLangs([])
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ v: 1 })))
    const out = await data.fetchLangMerged<{ v: number }>('json/x.json', (ps) => ps[0])
    expect(out).toEqual({ v: 1 })
    expect(spy.mock.calls[0][0]).toContain('/all/json/x.json')
  })

  it('2 languages fetch both slices and merge', async () => {
    const data = await withLangs(['es', 'fr'])
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) =>
      Promise.resolve(new Response(JSON.stringify({ v: String(u).includes('/es/') ? 1 : 2 }))))
    const out = await data.fetchLangMerged<{ v: number }>(
      'json/x.json', (ps) => ({ v: ps.reduce((s, p) => s + p.v, 0) }))
    expect(out).toEqual({ v: 3 })
  })
})

describe('getMovieBlurb', () => {
  it('returns the parsed blurb on 200', async () => {
    const data = await withLangs([])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ overview: 'o', runtime: 139 })))
    expect(await data.getMovieBlurb('tt1')).toEqual({ overview: 'o', runtime: 139 })
  })

  it('returns null when the sidecar is missing (404)', async () => {
    const data = await withLangs([])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    expect(await data.getMovieBlurb('tt2')).toBeNull()
  })

  it('returns null when fetch rejects', async () => {
    const data = await withLangs([])
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await data.getMovieBlurb('tt3')).toBeNull()
  })
})
