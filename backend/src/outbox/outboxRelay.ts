import { env } from '../config/env'
import { logger } from '../config/logger'

// Cross-store outbox relay (Phase 5). DB events are written to
// domain_outbox in the same transaction as the audit row (see
// trg_audit_to_outbox); this worker drains them and fans out to Redis
// pub/sub and a MongoDB event collection, then updates delivery status
// through pkg_outbox. Both stores are optional: with only Redis the Mongo
// snapshot is skipped and vice versa.
//
// Start with OUTBOX_RELAY_ENABLED=true (requires Oracle reachable).

export interface OutboxEvent {
  eventId: number
  eventType: string
  aggregateId: string
  payload: string
}

interface PoolLike {
  getConnection(): Promise<ConnectionLike>
  close(): Promise<void>
}
interface ConnectionLike {
  execute<T>(sql: string, binds?: unknown[], options?: { autoCommit?: boolean }): Promise<{ rows?: T[] }>
  close(): Promise<void>
}

const CHANNEL = 'railnexus:outbox'

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null
  private stopping = false
  private poolPromise: Promise<PoolLike> | null = null

  constructor(private readonly pollMs: number) {}

  async start(): Promise<void> {
    logger.info(`outbox relay started (poll ${this.pollMs}ms)`)
    await this.tick()
    if (this.stopping) return
    this.timer = setInterval(() => void this.tick().catch((err) => {
      logger.error('outbox tick error', { err })
    }), this.pollMs)
    this.timer.unref?.()
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.poolPromise) {
      const pool = await this.poolPromise.catch(() => null)
      await pool?.close().catch(() => undefined)
      this.poolPromise = null
    }
  }

  private pool(): Promise<PoolLike> {
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        const oracledb = await import('oracledb')
        const connectString = `${env.oracle.host}:${env.oracle.port}/${env.oracle.service}`
        return oracledb.createPool({
          user: env.oracle.user,
          password: env.oracle.password,
          connectString,
          poolMin: 1,
          poolMax: 2
        })
      })()
    }
    return this.poolPromise
  }

  private async tick(): Promise<void> {
    if (this.stopping || !env.oracle.enabled) return
    const events = await this.fetchPending()
    for (const event of events) {
      if (this.stopping) return
      try {
        await this.dispatch(event)
        await this.mark(event.eventId, true)
        logger.info('outbox delivered', { eventId: event.eventId, eventType: event.eventType })
      } catch (err) {
        await this.mark(event.eventId, false)
        logger.warn('outbox delivery failed', { eventId: event.eventId, err })
      }
    }
  }

  private async fetchPending(): Promise<OutboxEvent[]> {
    const oracle = await this.pool()
    const conn = await oracle.getConnection()
    try {
      const res = await conn.execute<Array<Array<string | number>>>(
        `SELECT event_id, event_type, aggregate_id, payload
           FROM domain_outbox
          WHERE status = 'N' AND next_attempt <= SYSTIMESTAMP
            AND ROWNUM <= 50
          ORDER BY event_id`
      )
      return (res.rows ?? []).map((row) => ({
        eventId: Number(row[0]),
        eventType: String(row[1]),
        aggregateId: String(row[2]),
        payload: String(row[3] ?? '')
      }))
    } finally {
      await conn.close()
    }
  }

  private async mark(eventId: number, ok: boolean): Promise<void> {
    const oracle = await this.pool()
    const conn = await oracle.getConnection()
    try {
      if (ok) {
        await conn.execute(
          `UPDATE domain_outbox SET status = 'S', delivered_at = SYSTIMESTAMP
            WHERE event_id = :1 AND status = 'N'`,
          [eventId],
          { autoCommit: true }
        )
      } else {
        await conn.execute(
          `UPDATE domain_outbox
              SET attempts = attempts + 1,
                  status = CASE WHEN attempts + 1 >= 5 THEN 'F' ELSE status END,
                  next_attempt = SYSTIMESTAMP + NUMTODSINTERVAL((attempts + 1) * 10, 'SECOND')
            WHERE event_id = :1`,
          [eventId],
          { autoCommit: true }
        )
      }
    } finally {
      await conn.close()
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    const message = JSON.stringify({
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      payload: event.payload
    })
    const tasks: Promise<unknown>[] = []
    if (env.redis.enabled) tasks.push(this.publishRedis(message))
    if (env.mongo.enabled) tasks.push(this.persistMongo(event, message))
    if (tasks.length === 0) {
      // No downstream store configured: still drain and mark delivered so the
      // outbox never stalls local writes.
      return
    }
    await Promise.all(tasks)
  }

  private async publishRedis(message: string): Promise<unknown> {
    const { default: Redis } = await import('ioredis')
    const client = new Redis({ host: env.redis.host, port: env.redis.port, lazyConnect: false })
    await client.publish(CHANNEL, message)
    await client.quit()
    return undefined
  }

  private async persistMongo(event: OutboxEvent, message: string): Promise<unknown> {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(env.mongo.url)
    await client.connect()
    try {
await client.db(env.mongo.db).collection('outbox_events').insertOne({
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        payload: JSON.parse(event.payload),
        raw: message,
        receivedAt: new Date()
      } as any)
    } finally {
      await client.close()
    }
    return undefined
  }
}