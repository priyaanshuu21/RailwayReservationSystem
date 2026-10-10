import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true'
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int(process.env.API_PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  apiKey: process.env.API_KEY ?? 'dev-api-key-change-me',

  oracle: {
    enabled: bool(process.env.ORACLE_ENABLED, true),
    host: process.env.ORACLE_HOST ?? 'localhost',
    port: int(process.env.ORACLE_PORT, 1521),
    service: process.env.ORACLE_SERVICE ?? 'FREEPDB1',
    user: process.env.ORACLE_USER ?? 'RAILNEXUS',
    password: process.env.ORACLE_PASSWORD ?? '',
    zoneUser: {
      NORTH: process.env.ORACLE_USER_NORTH ?? 'RAILNEXUS_NORTH',
      WEST: process.env.ORACLE_USER_WEST ?? 'RAILNEXUS_WEST',
      SOUTH: process.env.ORACLE_USER_SOUTH ?? 'RAILNEXUS_SOUTH'
    },
    zonePassword: process.env.ORACLE_ZONE_PASSWORD ?? '',
    pool: {
      min: int(process.env.ORACLE_POOL_MIN, 1),
      max: int(process.env.ORACLE_POOL_MAX, 8)
    }
  },

  redis: {
    enabled: bool(process.env.REDIS_ENABLED, true),
    host: process.env.REDIS_HOST ?? 'localhost',
    port: int(process.env.REDIS_PORT, 6379)
  },

  mongo: {
    enabled: bool(process.env.MONGO_ENABLED, true),
    url: process.env.MONGO_URL ?? 'mongodb://localhost:27017',
    db: process.env.MONGO_DB ?? 'railnexus'
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: int(process.env.JWT_REFRESH_TTL_DAYS, 7)
  }
}

export function oracleConnectString(host: string, port: number, service: string): string {
  return `${host}:${port}/${service}`
}