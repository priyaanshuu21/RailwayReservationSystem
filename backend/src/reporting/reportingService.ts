import { query } from '../db/oracle'
import { env } from '../config/env'
import { logger } from '../config/logger'

// Reporting service (Phase 10): reads the analytical views installed by
// db/reporting/report_views.sql (shared schema) and, where useful, aggregates the
// MongoDB telemetry time-series. All Oracle read paths are served by the shared
// pool; the materialized view is refreshed through pkg_reporting.

export interface RevenueDay {
  REVENUE_DATE: string
  BOOKING_COUNT: number
  REVENUE_TOTAL: number
}

export interface ZoneSummaryRow {
  ZONE_ID: number
  ZONE_CODE: string
  ZONE_NAME: string
  BOOKING_COUNT: number
  GROSS_FARE: number
  CONFIRMED_TICKETS: number
  WAITLISTED_TICKETS: number
}

export interface OccupancyRow {
  SCHEDULE_ID: number
  COACH_CLASS: string
  SEAT_COUNT: number
  OCCUPIED_SEATS: number
  OCCUPANCY_PCT: number
}

export async function revenueDaily(from?: string, to?: string): Promise<RevenueDay[]> {
  return query<RevenueDay>(
    `SELECT TO_CHAR(revenue_date, 'YYYY-MM-DD') AS revenue_date, booking_count, revenue_total
       FROM vw_revenue_daily
      WHERE (:1 IS NULL OR revenue_date >= TO_DATE(:1, 'YYYY-MM-DD'))
        AND (:2 IS NULL OR revenue_date <= TO_DATE(:2, 'YYYY-MM-DD'))
      ORDER BY revenue_date`,
    [from ?? null, to ?? null]
  )
}

export async function zoneSummary(): Promise<ZoneSummaryRow[]> {
  return query<ZoneSummaryRow>(
    `SELECT zone_id, zone_code, zone_name, booking_count, gross_fare,
            confirmed_tickets, waitlisted_tickets
       FROM vw_zone_summary
      ORDER BY zone_code`
  )
}

export async function occupancy(limit = 50): Promise<OccupancyRow[]> {
  return query<OccupancyRow>(
    `SELECT schedule_id, coach_class, seat_count, occupied_seats, occupancy_pct
       FROM (SELECT schedule_id, coach_class, seat_count, occupied_seats, occupancy_pct
               FROM vw_occupancy_by_schedule
              ORDER BY occupancy_pct DESC)
      WHERE ROWNUM <= :1`,
    [limit]
  )
}

export async function waitlistPressure(): Promise<Record<string, unknown>[]> {
  return query<Record<string, unknown>>(
    `SELECT schedule_id, coach_class, rac_count, wl_count
       FROM vw_waitlist_pressure
      ORDER BY wl_count DESC, rac_count DESC`
  )
}

export async function routePopularity(): Promise<Record<string, unknown>[]> {
  return query<Record<string, unknown>>(
    `SELECT route_id, booking_count, revenue
       FROM vw_route_popularity
      ORDER BY revenue DESC NULLS LAST`
  )
}

export async function revenueByTrain(): Promise<Record<string, unknown>[]> {
  return query<Record<string, unknown>>(
    `SELECT train_id, train_no, revenue
       FROM mv_revenue_by_train
      ORDER BY revenue DESC NULLS LAST`
  )
}

export async function refreshMaterialized(): Promise<string> {
  const oracledb = await import('oracledb')
  const { getSharedPool } = await import('../db/oracle')
  const pool = await getSharedPool()
  const conn = await pool.getConnection()
  try {
    const res = (await conn.execute(
      'BEGIN pkg_reporting.refresh_materialized(:msg); END;',
      [{ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 300 }]
    )) as { outBinds?: Array<string | null> }
    return res.outBinds?.[0] ?? 'refreshed'
  } finally {
    await conn.close().catch(() => undefined)
  }
}

export interface TelemetryBucket {
  sensorId: number
  alerts: number
  lastStatus: string | null
}

export async function telemetryBySensor(zoneCode: string): Promise<TelemetryBucket[]> {
  if (!env.mongo.enabled) return []
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(env.mongo.url, { serverSelectionTimeoutMS: 2000 })
  await client.connect()
  try {
    const docs = await client
      .db(env.mongo.db)
      .collection(env.iot.mongoCollection)
      .aggregate([
        { $match: { 'sensor.zone': zoneCode.toUpperCase() } },
        {
          $group: {
            _id: '$sensor.sensorId',
            alerts: { $sum: { $cond: [{ $ne: ['$alertId', null] }, 1, 0] } },
            lastStatus: { $last: '$status' }
          }
        },
        { $sort: { alerts: -1 } },
        { $limit: 50 }
      ])
      .toArray()
    return docs.map((d) => ({
      sensorId: Number(d._id),
      alerts: Number(d.alerts ?? 0),
      lastStatus: (d.lastStatus as string | null) ?? null
    }))
  } catch (err) {
    logger.warn('reporting mongo aggregation failed (degrading)', { err })
    return []
  } finally {
    await client.close().catch(() => undefined)
  }
}
