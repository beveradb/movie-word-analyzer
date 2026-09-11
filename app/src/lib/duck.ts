import * as duckdb from '@duckdb/duckdb-wasm'
import { DATA_BASE } from './data'

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
  return db.connect()
}

/** Lazy singleton connection; first call pays the WASM startup cost. */
export function getConn() {
  dbPromise ??= init()
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

export const pq = (name: string) => `read_parquet('${DATA_BASE}/${name}')`

/** SQL string literal escape. */
export const lit = (s: string) => `'${s.replaceAll("'", "''")}'`
