import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import { logger } from './config/logger'
import { healthRouter } from './api/routes/health'
import { metadataRouter } from './api/routes/metadata'
import { OutboxRelay } from './outbox/outboxRelay'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true
    })
  )
  app.use(express.json({ limit: '1mb' }))

  app.use('/health', healthRouter)
  app.use('/api/metadata', metadataRouter)

  app.get('/api', (_req, res) => {
    res.json({ service: 'railnexus-api', version: '0.1.0', docs: '/api-docs' })
  })

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('unhandled error', { err })
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: {}
    })
  })

  return app
}

export async function start() {
  const app = createApp()
  const server = app.listen(env.port, () => {
    logger.info(`railnexus api listening on http://localhost:${env.port}`)
  })

  let relay: OutboxRelay | undefined
  if (env.oracle.enabled && env.outbox.relayEnabled) {
    relay = new OutboxRelay(env.outbox.pollMs)
    relay.start().catch((err) => logger.error('outbox relay failed to start', { err }))
  }

  const shutdown = (signal: string) => {
    logger.info(`received ${signal}, shutting down`)
    server.close(async () => {
      await relay?.stop().catch(() => undefined)
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  return server
}

if (require.main === module) {
  start().catch((err) => {
    logger.error('failed to start', { err })
    process.exit(1)
  })
}