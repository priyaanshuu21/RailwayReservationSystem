// Minimal ambient typings for the oracledb thin/thick driver (6.x).
// The npm package ships no type declarations; extend this as the surface the
// app actually uses grows. The real driver is loaded lazily at runtime.

declare module 'oracledb' {
  export interface PoolConfig {
    user: string
    password: string
    connectString: string
    poolMin?: number
    poolMax?: number
    poolIncrement?: number
    poolTimeout?: number
  }

  export interface Pool {
    getConnection(): Promise<Connection>
    close(terminate?: boolean): Promise<void>
  }

  export interface Connection {
    close(): Promise<void>
    execute<T>(sql: string, binds?: unknown, options?: unknown): Promise<T>
  }

  export interface Result<T> {
    rows: T[]
    rowsAffected: number
  }

  export function createPool(config: PoolConfig): Promise<Pool>

  const oracledb: {
    createPool: typeof createPool
  }
  export default oracledb
}