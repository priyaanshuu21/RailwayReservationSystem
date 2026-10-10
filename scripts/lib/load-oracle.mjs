// library used by dev-setup / dev-reset-demo.
// Discovers an Oracle connection and applies schema + seed scripts in dependency order.
// Uses sqlplus when present (local Oracle instance), otherwise reports the Docker path.
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

function findSqlplus() {
  const candidates = [
    'sqlplus',
    'C:\\oraclexe\\app\\oracle\\product\\11.2.0\\server\\bin\\sqlplus.exe'
  ]
  for (const c of candidates) {
    try { execSync(`${c} -V`, { stdio: 'pipe' }); return c } catch { /* keep looking */ }
  }
  return null
}

function loadEnvVars(root) {
  const file = path.join(root, '.env')
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^"?|"?$/g, '')
  }
  return out
}

function orderScripts(dbDir) {
  const scripts = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const name of ['00_bootstrap.sql', '01_core_schema.sql', '02_seed_data.sql']) {
      const p = path.join(dir, name)
      if (existsSync(p)) scripts.push(p)
    }
    for (const name of ['schema.sql', 'seed.sql']) {
      const p = path.join(dir, name)
      if (existsSync(p)) scripts.push(p)
    }
  }
  walk(path.join(dbDir, 'shared_ddl'))
  for (const zone of ['zone_north', 'zone_west', 'zone_south']) walk(path.join(dbDir, zone))
  walk(path.join(dbDir, 'plsql'))
  return [...new Set(scripts)]
}

async function oracleUp(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
  })
}

export async function applySchemaAndSeed(root, log) {
  const env = loadEnvVars(root)
  const port = Number(env.ORACLE_PORT ?? 1521)
  const service = env.ORACLE_SERVICE ?? 'XE'
  const adminUser = env.ORACLE_ADMIN_USER ?? 'system'
  const adminPass = env.ORACLE_ADMIN_PASSWORD ?? 'system'

  if (!(await oracleUp(port))) {
    throw new Error('Oracle is not reachable. Use docker compose up -d --build, or fix .env.')
  }

  const sqlplus = findSqlplus()
  if (!sqlplus) {
    throw new Error('Oracle reachable but no sqlplus found; run scripts from the Oracle container instead.')
  }

  const scripts = orderScripts(path.join(root, 'db'))
  const admin = `${adminUser}/${adminPass}@localhost:${port}/${service}`
  for (const script of scripts) {
    log(`applying ${path.relative(root, script)}`)
    const cmd = `echo exit | ${sqlplus} -S -L ${admin} @${script}`
    try {
      execSync(cmd, { stdio: 'inherit', encoding: 'utf8' })
    } catch (err) {
      throw new Error(`Script failed: ${path.relative(root, script)} - ${err.message}`)
    }
  }
}