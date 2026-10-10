import bcrypt from 'bcryptjs'
import { query } from '../db/oracle'

// Authentication service (Phase 8): verifies credentials against the shared
// PERSON table and resolves role membership from the subtype tables.

export interface AuthUser {
  personId: number
  fullName: string
  email: string
  personType: string
  roles: string[]
}

interface PersonRow {
  PERSON_ID: number
  FULL_NAME: string
  EMAIL: string
  PERSON_TYPE: string
  PASSWORD_HASH: string | null
  LOGIN_ENABLED: number
}

const ROLE_TABLES = [
  { table: 'passenger', column: 'person_id', role: 'passenger' },
  { table: 'tte_conductor', column: 'employee_id', role: 'tte' },
  { table: 'station_master', column: 'employee_id', role: 'station_master' },
  { table: 'zone_admin', column: 'employee_id', role: 'zone_admin' },
  { table: 'super_admin', column: 'employee_id', role: 'super_admin' }
] as const

export async function loadRoles(personId: number): Promise<string[]> {
  const roles: string[] = []
  for (const entry of ROLE_TABLES) {
    const rows = await query<{ ONE: number }>(
      `SELECT 1 AS one FROM ${entry.table} WHERE ${entry.column} = :1 AND ROWNUM = 1`,
      [personId]
    )
    if (rows.length > 0) roles.push(entry.role)
  }
  return roles
}

export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const rows = await query<PersonRow>(
    `SELECT person_id, full_name, email, person_type, password_hash, login_enabled
       FROM person WHERE LOWER(email) = LOWER(:1)`,
    [email]
  )
  const row = rows[0]
  if (!row || row.LOGIN_ENABLED !== 1 || !row.PASSWORD_HASH) return null
  const ok = await bcrypt.compare(password, row.PASSWORD_HASH)
  if (!ok) return null
  return {
    personId: row.PERSON_ID,
    fullName: row.FULL_NAME,
    email: row.EMAIL,
    personType: row.PERSON_TYPE,
    roles: await loadRoles(row.PERSON_ID)
  }
}
