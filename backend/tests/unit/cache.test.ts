import { RedisCache, type RedisLike } from '../../src/cache/redis'
import { cacheKeys, CACHE_TTL } from '../../src/cache/keys'

class FakeRedis {
  store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async set(key: string, value: string, _mode: 'EX' | 'PX', _ttl: number, flag?: 'NX'): Promise<'OK' | null> {
    if (flag === 'NX' && this.store.has(key)) return null
    this.store.set(key, value)
    return 'OK'
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0
    for (const k of keys) if (this.store.delete(k)) n += 1
    return n
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, '')
    return [...this.store.keys()].filter((k) => k.startsWith(prefix))
  }

  async eval(_script: string, _numKeys: number, ...args: Array<string | number>): Promise<unknown> {
    const [key = '', token = ''] = args.map(String)
    if (this.store.get(key) === token) {
      this.store.delete(key)
      return 1
    }
    return 0
  }

  async quit(): Promise<'OK'> {
    this.store.clear()
    return 'OK'
  }
}

const newCache = (fake: FakeRedis) => new RedisCache(async () => fake as unknown as RedisLike)

describe('RedisCache', () => {
  it('round-trips JSON values', async () => {
    const cache = newCache(new FakeRedis())
    await cache.setJson('k', { a: 1 }, 10)
    expect(await cache.getJson<{ a: number }>('k')).toEqual({ a: 1 })
  })

  it('returns null for a missing key', async () => {
    const cache = newCache(new FakeRedis())
    expect(await cache.getJson('missing')).toBeNull()
  })

  it('deletes keys by prefix', async () => {
    const fake = new FakeRedis()
    const cache = newCache(fake)
    await cache.setJson('rxn:avail:1:SL', 1, 10)
    await cache.setJson('rxn:avail:1:3A', 2, 10)
    await cache.setJson('rxn:meta:stations', 3, 10)
    await cache.delByPrefix('rxn:avail:')
    expect(fake.store.has('rxn:avail:1:SL')).toBe(false)
    expect(fake.store.has('rxn:meta:stations')).toBe(true)
  })

  it('grants a lock once and only releases with the matching token', async () => {
    const fake = new FakeRedis()
    const cache = newCache(fake)
    const token = await cache.acquireLock('lock:1', 5000)
    expect(token).not.toBeNull()
    expect(await cache.acquireLock('lock:1', 5000)).toBeNull()
    await cache.releaseLock('lock:1', 'wrong-token')
    expect(fake.store.has('lock:1')).toBe(true)
    await cache.releaseLock('lock:1', token as string)
    expect(fake.store.has('lock:1')).toBe(false)
  })
})

describe('cacheKeys', () => {
  it('builds stable, namespaced keys', () => {
    expect(cacheKeys.availability(7, '3A')).toBe('rxn:avail:7:3A')
    expect(cacheKeys.bookingLock(7, 'SL')).toBe('rxn:lock:7:SL')
    expect(cacheKeys.fare('S', '2A')).toBe('rxn:fare:S:2A')
    expect(CACHE_TTL.availability).toBeLessThan(CACHE_TTL.metadata)
  })
})
