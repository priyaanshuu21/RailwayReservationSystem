import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { withZoneConnection } from '../../db/zoneRouter'
import { ingestReading, resolveZone, UnknownZoneError } from '../../iot/iotService'

// IoT REST surface (Phase 7). Every call is scoped to a zone because sensor
// readings and alerts are fragmented with the coach inventory.

export const iotRouter = Router()

type Handler = (req: Request, res: Response) => Promise<void>
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

async function queryZone<T>(zoneCode: string, sql: string, binds: unknown[] = []): Promise<T[]> {
  const zone = resolveZone(zoneCode)
  const oracledb = await import('oracledb')
  return withZoneConnection(zone, async (conn) => {
    const res = await conn.execute<{ rows?: T[] }>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
    return res.rows ?? []
  })
}

const zoneQuery = z.object({ zoneCode: z.string().min(1) })

const readingSchema = z.object({
  zoneCode: z.string().min(1),
  sensorId: z.coerce.number().int().positive(),
  value: z.coerce.number()
})

iotRouter.post(
  '/readings',
  wrap(async (req, res) => {
    const parsed = readingSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    try {
      const result = await ingestReading(parsed.data)
      res.status(201).json(result)
    } catch (err) {
      if (err instanceof UnknownZoneError) {
        res.status(400).json({ code: 'UNKNOWN_ZONE', message: err.message })
        return
      }
      throw err
    }
  })
)

iotRouter.get(
  '/sensors',
  wrap(async (req, res) => {
    const parsed = zoneQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    const coachId = req.query.coachId ? Number(req.query.coachId) : null
    const rows = await queryZone(
      parsed.data.zoneCode,
      `SELECT sensor_id, coach_id, sensor_code, sensor_kind, unit, min_value, max_value, active
         FROM iot_sensor
        WHERE (:1 IS NULL OR coach_id = :1)
        ORDER BY coach_id, sensor_kind`,
      [coachId]
    )
    res.json({ sensors: rows })
  })
)

iotRouter.get(
  '/sensors/:sensorId/latest',
  wrap(async (req, res) => {
    const parsed = zoneQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    const sensorId = Number(req.params.sensorId)
    const rows = await queryZone(
      parsed.data.zoneCode,
      `SELECT reading_id, sensor_id, reading_time, value, status
         FROM (SELECT reading_id, sensor_id, reading_time, value, status
                 FROM sensor_reading
                WHERE sensor_id = :1
                ORDER BY reading_time DESC)
        WHERE ROWNUM = 1`,
      [sensorId]
    )
    if (rows.length === 0) {
      res.status(404).json({ code: 'NO_READINGS', message: `no readings for sensor ${sensorId}` })
      return
    }
    res.json({ latest: rows[0] })
  })
)

iotRouter.get(
  '/alerts',
  wrap(async (req, res) => {
    const parsed = zoneQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    const rows = await queryZone(
      parsed.data.zoneCode,
      `SELECT alert_id, sensor_id, reading_id, severity, status, message, raised_at
         FROM sensor_alert
        WHERE status = 'OPEN'
        ORDER BY raised_at DESC`
    )
    res.json({ alerts: rows })
  })
)

iotRouter.post(
  '/alerts/:alertId/ack',
  wrap(async (req, res) => {
    const parsed = z
      .object({ zoneCode: z.string().min(1), actor: z.string().min(1) })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'zoneCode and actor required' })
      return
    }
    const alertId = Number(req.params.alertId)
    const oracledb = await import('oracledb')
    const zone = resolveZone(parsed.data.zoneCode)
    const message = await withZoneConnection(zone, async (conn) => {
      const result = await conn.execute<{ outBinds?: Array<string | null> }>(
        'BEGIN pkg_iot.acknowledge_alert(:id, :actor, :msg); END;',
        [
          alertId,
          parsed.data.actor,
          { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 300 }
        ]
      )
      return result.outBinds?.[2] ?? null
    })
    res.json({ alertId, acknowledged: true, message })
  })
)
