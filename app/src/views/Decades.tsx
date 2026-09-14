import { useEffect, useState } from 'react'
import { getSignatures } from '../lib/data'
import { navigate } from '../lib/route'
import { ErrorBox, Spinner } from '../components/ui'
import { EraMotif } from '../components/motifs'

interface DecadeCard {
  id: string
  movie_count: number
}

/** One-line era tagline per decade, shown on the card under the name. */
const TAGLINES: Record<string, string> = {
  '1910': 'the first reels',
  '1920': 'the talkies arrive',
  '1930': 'the golden age',
  '1940': 'war and film noir',
  '1950': 'the atomic age',
  '1960': 'the new wave',
  '1970': 'New Hollywood',
  '1980': 'the blockbuster era',
  '1990': 'the indie boom',
  '2000': 'the multiplex years',
  '2010': 'the streaming dawn',
  '2020': 'cinema now',
}

/** Index of every decade study, in order - the discovery path into the
 * per-decade #/decade/:id pages, sibling of the Genres index. */
export function DecadesView() {
  const [decades, setDecades] = useState<DecadeCard[] | null | undefined>(undefined)

  useEffect(() => {
    getSignatures('decades')
      .then((all) =>
        setDecades(
          Object.entries(all)
            .map(([id, e]) => ({ id, movie_count: e.movie_count }))
            .sort((a, b) => Number(a.id) - Number(b.id)),
        ),
      )
      .catch(() => setDecades(null))
  }, [])

  if (decades === undefined) return <Spinner label="Loading decades…" />
  if (decades === null)
    return <ErrorBox message="Couldn't load decades." retry={() => navigate('/')} />

  return (
    <div>
      <div className="border-b-2 border-ink pb-2">
        <p className="font-script text-xs uppercase tracking-widest text-ink-2">Browse by</p>
        <h1 className="slug mt-1 text-3xl sm:text-4xl">DECADES</h1>
        <p className="mt-1 font-script text-sm text-ink-2">
          How each era of cinema talked - {decades.length} studies.
        </p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {decades.map((d) => (
          <button
            key={d.id}
            onClick={() => navigate(`/decade/${d.id}`)}
            className="flex flex-col items-start gap-2 border-2 border-ink bg-card p-4 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <EraMotif decade={d.id} className="h-14 w-14 text-ink-3" />
            <div>
              <div className="font-script text-lg font-bold">{d.id}s</div>
              <div className="font-script text-xs text-ink-2">{TAGLINES[d.id] ?? ''}</div>
              <div className="mt-1 text-xs text-ink-3">{d.movie_count.toLocaleString()} films</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
