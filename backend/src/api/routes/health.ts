import { Router } from 'express'
import { env } from '../../config/env'

export const healthRouter = Router()

healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

healthRouter.get('/ready', (_req, res) => {
  const checks = {
    api: 'ok',
    oracle: env.oracle.enabled ? 'pending' : 'disabled',
    redis: env.redis.enabled ? 'pending' : 'disabled',
    mongo: env.mongo.enabled ? 'pending' : 'disabled'
  }
  const ready = Object.values(checks).every((v) => v === 'ok' || v === 'disabled')
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks })
})