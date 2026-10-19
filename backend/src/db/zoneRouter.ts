import type { Pool, Connection } from 'oracledb'
import { env, oracleConnectString } from '../config/env'

// RailNexus zone router: the server maps any station/schedule/zone id to the
// Oracle schema that OWNS the fragmented inventory for it. Availability and
// booking calls are then issued against the right zone connection (or, for the
// distributed demo, through the schema's DB links seed in db/distributed/).
//
// Pools are created lazily per zone and only if Oracle is enabled, so the app
// still boots for frontend-only development.

export type ZoneCode = 'NR' | 'WR' | 'SR'

export interface ZoneDefinition {
  code: ZoneCode
  zoneId: number
  schema: string
  link: string
  stationIds: number[]
}

export const ZONES: readonly ZoneDefinition[] = [
  {
    code: 'NR',
    zoneId: 1,
    schema: env.oracle.zoneUser.NORTH,
    link: 'ZONE_NORTH',
    stationIds: [101, 102, 103, 104],
  },
  {
    code: 'WR',
    zoneId: 2,
    schema: env.oracle.zoneUser.WEST,
    link: 'ZONE_WEST',
    stationIds: [201, 202, 203],
  },
  {
    code: 'SR',
    zoneId: 3,
    schema: env.oracle.zoneUser.SOUTH,
    link: 'ZONE_SOUTH',
    stationIds: [301, 302, 303],
  },
]

export function zoneForStation(stationId: number): ZoneDefinition | undefined {
  return ZONES.find((z) => z.stationIds.includes(stationId))
}

export function zoneForCode(code: string): ZoneDefinition | undefined {
  return ZONES.find((z) => z.code === code)
}

export function zoneForZoneId(zoneId: number): ZoneDefinition | undefined {
  return ZONES.find((z) => z.zoneId === zoneId)
}

// All zones currently share one Oracle instance/service; the connect string is
// therefore common. If zones are moved onto dedicated nodes, extend this with a
// per-zone host/service map keyed by ZoneCode.
export function zoneConnectString(): string {
  return oracleConnectString(
    env.oracle.host,
    env.oracle.port,
    env.oracle.service,
  )
}

const pools = new Map<string, Promise<Pool>>()

function poolFor(zone: ZoneDefinition): Promise<Pool> {
  const existing = pools.get(zone.code)
  if (existing) return existing
  const creating = (async () => {
    const { default: oracledb } = await import('oracledb')
    return oracledb.createPool({
      user: zone.schema,
      password: env.oracle.zonePassword,
      connectString: zoneConnectString(),
      poolMin: env.oracle.pool.min,
      poolMax: env.oracle.pool.max,
    })
  })()
  creating.catch(() => {
    if (pools.get(zone.code) === creating) pools.delete(zone.code)
  })
  pools.set(zone.code, creating)
  return creating
}

export async function withZoneConnection<T>(
  zone: ZoneDefinition,
  fn: (conn: Connection) => Promise<T> | T,
): Promise<T> {
  const pool = await poolFor(zone)
  const conn = await pool.getConnection()
  try {
    return await fn(conn)
  } finally {
    await conn.close().catch(() => undefined)
  }
}

export async function closeZonePools(): Promise<void> {
  const pending = Array.from(pools.values())
  pools.clear()
  await Promise.all(
    pending.map((p) => p.then((pool) => pool.close()).catch(() => undefined)),
  )
}

export const zoneRouter = {
  ZONES,
  zoneForStation,
  zoneForCode,
  zoneForZoneId,
  zoneConnectString,
  withZoneConnection,
  closeZonePools,
}
