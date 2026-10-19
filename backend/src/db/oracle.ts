import { env } from '../config/env'
import { logger } from '../config/logger'

// Shared Oracle pool + query helpers (Phase 6). The API's read paths (metadata
// catalogue, availability) use this; write paths use the zone router pools.

export interface OracleConn {
  execute<T>(
    sql: string,
    binds?: unknown[] | Record<string, unknown>,
    options?: { outFormat?: number; autoCommit?: boolean },
  ): Promise<{ rows?: T[]; rowsAffected?: number }>
  close(): Promise<void>
}

export interface OraclePool {
  getConnection(): Promise<OracleConn>
  close(): Promise<void>
}

let poolPromise: Promise<OraclePool> | null = null

export function connectString(): string {
  return `${env.oracle.host}:${env.oracle.port}/${env.oracle.service}`
}

export function getSharedPool(): Promise<OraclePool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const { default: oracledb } = await import('oracledb')
      const pool = await oracledb.createPool({
        user: env.oracle.user,
        password: env.oracle.password,
        connectString: connectString(),
        poolMin: env.oracle.pool.min,
        poolMax: env.oracle.pool.max,
      })
      return pool as unknown as OraclePool
    })().catch((err) => {
      poolPromise = null
      throw err
    })
  }
  return poolPromise
}

export async function query<T>(
  sql: string,
  binds: unknown[] = [],
): Promise<T[]> {
  const { default: oracledb } = await import('oracledb')
  const pool = await getSharedPool()
  const conn = await pool.getConnection()
  try {
    const namedBinds = Object.fromEntries(
      binds.map((value, index) => [String(index + 1), value]),
    )
    const res = await conn.execute<T>(sql, namedBinds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    })
    return res.rows ?? []
  } finally {
    await conn.close().catch(() => undefined)
  }
}

export async function closeSharedPool(): Promise<void> {
  if (!poolPromise) return
  const pool = await poolPromise.catch(() => null)
  await pool?.close().catch(() => undefined)
  poolPromise = null
}

export async function probeOracle(): Promise<'ok' | 'down' | 'disabled'> {
  if (!env.oracle.enabled) return 'disabled'
  try {
    const rows = await query<{ OK: number }>('SELECT 1 AS ok FROM DUAL')
    return rows.length > 0 ? 'ok' : 'down'
  } catch (err) {
    logger.warn('oracle probe failed', { err })
    return 'down'
  }
}
