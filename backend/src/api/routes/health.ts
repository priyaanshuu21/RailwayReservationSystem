import { Router } from 'express'
import { env } from '../../config/env'
import { probeOracle } from '../../db/oracle'
import { redisCache } from '../../cache/redis'

export const healthRouter = Router()

interface MongoClientLike {
  connect(): Promise<void>
  db(): { command(cmd: Record<string, unknown>): Promise<unknown> }
  close(): Promise<void>
}

async function probeMongo(): Promise<'ok' | 'down' | 'disabled'> {
  if (!env.mongo.enabled) return 'disabled'
  try {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(env.mongo.url, { serverSelectionTimeoutMS: 1500 }) as unknown as MongoClientLike
    await client.connect()
    try {
      await client.db().command({ ping: 1 })
      return 'ok'
    } finally {
      await client.close().catch(() => undefined)
    }
  } catch {
    return 'down'
  }
}

healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

healthRouter.get('/ready', async (_req, res) => {
  const [oracle, redis, mongo] = await Promise.all([
    probeOracle(),
    redisCache.ping(),
    probeMongo()
  ])
  const checks = { api: 'ok', oracle, redis, mongo }
  const ready = Object.values(checks).every((v) => v === 'ok' || v === 'disabled')
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks })
})