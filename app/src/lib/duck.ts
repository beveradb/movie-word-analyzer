import * as duckdb from '@duckdb/duckdb-wasm'
import { dataUrl } from './data'
import { activeLanguages } from './languages'

let dbPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null

async function init(): Promise<duckdb.AsyncDuckDBConnection> {
  const bundles = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(bundles)
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
  )
  const worker = new Worker(workerUrl)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)
  // Without this, duckdb-wasm downloads entire parquets (93MB on Trends)
  // instead of range-reading the row groups a query needs: this build ships
  // with forceFullHTTPReads effectively ON, which skips range detection and
  // plain-GETs the whole file. Turning it off + trusting the bucket's ranged
  // HEAD makes reads ~KB instead of ~MB. allowFullHTTPReads stays default
  // (true) so a proxy/cache that breaks range probes degrades to the old
  // full-download behavior instead of erroring.
  await db.open({
    path: ':memory:',
    filesystem: { forceFullHTTPReads: false, reliableHeadRequests: true },
  })
  return db.connect()
}

/** Lazy singleton connection; first call pays the WASM startup cost.
 * A failed init (CDN blocked, flaky network) is NOT memoized - the next
 * call retries instead of leaving every SQL feature dead until reload. */
export function getConn() {
  if (!dbPromise) {
    dbPromise = init()
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/** Run SQL and return plain JS row objects (BigInts down-converted). */
export async function q<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const conn = await getConn()
  const result = await conn.query(sql)
  return result.toArray().map((row) => {
    const obj = row.toJSON() as Record<string, unknown>
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'bigint') obj[k] = Number(obj[k])
    }
    return obj as T
  })
}

export const pq = (name: string) => `read_parquet('${dataUrl(name)}')`

/** SQL string literal escape. */
export const lit = (s: string) => `'${s.replaceAll("'", "''")}'`

/** ` AND <alias>.original_language IN (...)` for the active selection, or '' when
 * nothing is selected. Expands the merged Chinese option to both TMDB codes. */
export function langFilterSql(alias = 'm'): string {
  const langs = activeLanguages()
  if (!langs.length) return ''
  const codes = langs.includes('zh') ? [...langs, 'cn'] : langs
  return ` AND ${alias}.original_language IN (${codes.map(lit).join(',')})`
}
