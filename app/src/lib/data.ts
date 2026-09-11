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
  words: [string, number, number][]
  stopwords: [string, number, number][]
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

export const getMovieIndex = () => fetchJSON<MovieIndexEntry[]>('json/movies-index.json')
export const getMovie = (id: string) => fetchJSON<MovieDetail>(`json/movie/${id}.json`)
export const getLeaderboard = () => fetchJSON<Leaderboard>('json/leaderboard-default.json')
export const getWordlists = () => fetchJSON<Wordlists>('json/wordlists.json')
