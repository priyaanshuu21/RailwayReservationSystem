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
    execute<T>(
      sql: string,
      binds?: unknown,
      options?: { outFormat?: number; autoCommit?: boolean }
    ): Promise<T>
  }

  export interface Result<T> {
    rows: T[]
    rowsAffected: number
  }

  export const OUT_FORMAT_OBJECT: number
  export const BIND_OUT: number
  export const NUMBER: number
  export const STRING: number

  export interface BindParameter {
    dir?: number
    type?: number
    maxSize?: number
    val?: unknown
  }

  export function createPool(config: PoolConfig): Promise<Pool>

  const oracledb: {
    createPool: typeof createPool
    OUT_FORMAT_OBJECT: number
    BIND_OUT: number
    NUMBER: number
    STRING: number
  }
  export default oracledb
}