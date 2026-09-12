export const DATA_BASE =
  import.meta.env.VITE_DATA_BASE ?? 'https://moviewords-data.beveradb.com'

export interface MovieIndexEntry {
  id: string
  title: string
  year: number
  rating: number
  votes: number
  total_words: number
  unique_words: number
  genres: string[]
}

export interface MovieDetail {
  imdb_id: string
  title: string
  year: number
  stats: { total_words: number; unique_words: number; words_per_minute: number | null }
  top: [string, number][]
  top_all: [string, number][]
  distinctive: [string, number][]
}

export interface Leaderboard {
  words: [string, number, number, ...unknown[]][]
  stopwords: [string, number, number, ...unknown[]][]
}

export interface Wordlists {
  stopwords: string[]
  profanity: string[]
}

const cache = new Map<string, unknown>()

export async function fetchJSON<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T
  const res = await fetch(`${DATA_BASE}/${path}`)
  if (!res.ok) throw new Error(`${res.status} fetching ${path}`)
  const data = (await res.json()) as T
  cache.set(path, data)
  return data
}

export interface SignatureEntry {
  movie_count: number
  total_words: number
  top: [string, number][]
  signature: [string, number][]
  /** v2 fields (extended signatures) — absent on older cached JSON. */
  swears_per_1k?: number
  unique_words?: number
  top500?: [string, number][]
}

export interface ShiftRow {
  word: string
  score: number
  rates: [number, number][]
}

export interface Shifts {
  decades: number[]
  risers: ShiftRow[]
  fallers: ShiftRow[]
}

export interface FilmSuperlative {
  id: string
  title: string
  year: number
  value: number
}

export interface Superlatives {
  chattiest: FilmSuperlative[]
  vocabulary: FilmSuperlative[]
  sweariest: FilmSuperlative[]
  repetitive: FilmSuperlative[]
}

export interface WonderRow {
  word: string
  id: string
  title: string
  year: number
  count: number
  total: number
  share: number
}

export interface UbiquityRow {
  word: string
  films: number
  share: number
}

export const getShifts = () => fetchJSON<Shifts>('json/leaderboards/shifts.json')
export const getSuperlatives = () => fetchJSON<Superlatives>('json/leaderboards/films.json')
export const getWonders = () => fetchJSON<WonderRow[]>('json/leaderboards/wonders.json')
export const getUbiquity = () => fetchJSON<UbiquityRow[]>('json/leaderboards/everywhere.json')

export const getSignatures = (kind: 'decades' | 'genres') =>
  fetchJSON<Record<string, SignatureEntry>>(`json/signature/${kind}.json`)

export const getMovieIndex = () => fetchJSON<MovieIndexEntry[]>('json/movies-index.json')
export const getMovie = (id: string) => fetchJSON<MovieDetail>(`json/movie/${id}.json`)
export const getLeaderboard = () => fetchJSON<Leaderboard>('json/leaderboard-default.json')
export const getWordlists = () => fetchJSON<Wordlists>('json/wordlists.json')
