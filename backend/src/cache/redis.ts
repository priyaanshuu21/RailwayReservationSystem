import { env } from '../config/env'
import { logger } from '../config/logger'

// Thin Redis cache wrapper (Phase 6): availability snapshots, the metadata
// catalogue and distributed booking locks. When REDIS_ENABLED is false every
// method degrades to a no-op, and any runtime Redis error is swallowed with a
// warning so the API keeps serving from Oracle.

export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>
  set(key: string, value: string, mode: 'PX', ttl: number, flag: 'NX'): Promise<unknown>
  del(...keys: string[]): Promise<unknown>
  keys(pattern: string): Promise<string[]>
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>
  quit(): Promise<unknown>
}

export type RedisClientFactory = () => Promise<RedisLike>

async function defaultFactory(): Promise<RedisLike> {
  const { default: Redis } = await import('ioredis')
  const client = new Redis({ host: env.redis.host, port: env.redis.port, lazyConnect: false })
  return client as unknown as RedisLike
}

const RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

export class RedisCache {
  private clientPromise: Promise<RedisLike> | null = null

  constructor(private readonly factory: RedisClientFactory = defaultFactory) {}

  private client(): Promise<RedisLike> {
    if (!this.clientPromise) this.clientPromise = this.factory()
    return this.clientPromise
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!env.redis.enabled) return null
    try {
      const raw = await (await this.client()).get(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch (err) {
      logger.warn('redis get failed (degrading)', { key, err })
      return null
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!env.redis.enabled) return
    try {
      await (await this.client()).set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch (err) {
      logger.warn('redis set failed (degrading)', { key, err })
    }
  }

  async del(key: string): Promise<void> {
    if (!env.redis.enabled) return
    try {
      await (await this.client()).del(key)
    } catch (err) {
      logger.warn('redis del failed (degrading)', { key, err })
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (!env.redis.enabled) return
    try {
      const client = await this.client()
      const keys = await client.keys(`${prefix}*`)
      if (keys.length > 0) await client.del(...keys)
    } catch (err) {
      logger.warn('redis delByPrefix failed (degrading)', { prefix, err })
    }
  }

  // Distributed lock: SET NX PX with a caller-owned token; release is atomic.
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    if (!env.redis.enabled) return null
    const token = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    try {
      const res = await (await this.client()).set(key, token, 'PX', ttlMs, 'NX')
      return res ? token : null
    } catch (err) {
      logger.warn('redis lock acquire failed', { key, err })
      return null
    }
  }

  async releaseLock(key: string, token: string): Promise<void> {
    if (!env.redis.enabled) return
    try {
      await (await this.client()).eval(RELEASE_SCRIPT, 1, key, token)
    } catch (err) {
      logger.warn('redis lock release failed', { key, err })
    }
  }

  async ping(): Promise<string> {
    if (!env.redis.enabled) return 'disabled'
    try {
      const res = await (await this.client()).get('__redis_ping__')
      return res === null ? 'ok' : 'ok'
    } catch {
      return 'down'
    }
  }

  async close(): Promise<void> {
    if (!this.clientPromise) return
    const client = await this.clientPromise.catch(() => null)
    await client?.quit().catch(() => undefined)
    this.clientPromise = null
  }
}

export const redisCache = new RedisCache()