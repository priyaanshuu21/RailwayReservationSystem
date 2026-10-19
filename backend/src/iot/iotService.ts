import type { Connection } from 'oracledb'
import { env } from '../config/env'
import { logger } from '../config/logger'
import {
  zoneForCode,
  withZoneConnection,
  type ZoneDefinition,
} from '../db/zoneRouter'
import type { ReadingStatus } from '../domain/iot'

// IoT ingestion service (Phase 7): readings are written into the zone schema
// that owns the coach (via pkg_iot.ingest_reading so thresholding and alert
// creation are transactional), then snapshotted to the MongoDB time-series
// collection for analytics. Mongo is best-effort and never blocks ingestion.

export interface IngestInput {
  zoneCode: string
  sensorId: number
  value: number
}

export interface IngestResult {
  readingId: number
  status: ReadingStatus
  alertId: number | null
}

export class UnknownZoneError extends Error {
  readonly statusCode = 400
  constructor(code: string) {
    super(`unknown zone '${code}'`)
    this.name = 'UnknownZoneError'
  }
}

export function resolveZone(code: string): ZoneDefinition {
  const zone = zoneForCode(code.toUpperCase())
  if (!zone) throw new UnknownZoneError(code)
  return zone
}

async function callIngest(
  conn: Connection,
  sensorId: number,
  value: number,
): Promise<IngestResult> {
  const { default: oracledb } = await import('oracledb')
  const res = await conn.execute<{ outBinds?: Array<number | string | null> }>(
    'BEGIN pkg_iot.ingest_reading(:sid, :val, :rid, :st, :aid); END;',
    [
      sensorId,
      value,
      { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    ],
  )
  const out = res.outBinds ?? []
  return {
    readingId: Number(out[0]),
    status: String(out[1]) as ReadingStatus,
    alertId: out[2] === null || out[2] === undefined ? null : Number(out[2]),
  }
}

export async function ingestReading(input: IngestInput): Promise<IngestResult> {
  const zone = resolveZone(input.zoneCode)
  const result = await withZoneConnection(zone, (conn) =>
    callIngest(conn, input.sensorId, input.value),
  )
  await persistReadingMongo(zone.code, input, result).catch((err) =>
    logger.warn('iot mongo snapshot failed (degrading)', { err }),
  )
  return result
}

async function persistReadingMongo(
  zoneCode: string,
  input: IngestInput,
  result: IngestResult,
): Promise<void> {
  if (!env.mongo.enabled) return
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(env.mongo.url, {
    serverSelectionTimeoutMS: 2000,
  })
  await client.connect()
  try {
    await client
      .db(env.mongo.db)
      .collection(env.iot.mongoCollection)
      .insertOne({
        ts: new Date(),
        sensor: { zone: zoneCode, sensorId: input.sensorId },
        value: input.value,
        status: result.status,
        alertId: result.alertId,
      } as Record<string, unknown>)
  } finally {
    await client.close().catch(() => undefined)
  }
}
