// library used by dev-setup / dev-reset-demo.
// Reads db/manifest.txt (script path | schema target) and applies each file with sqlplus.
// Targets: $SYS  -> administrative connection (system/sys)
//          <NAME> -> schema user credential (user is NAME, password from .env)
import { readFileSync, existsSync } from 'node:fs'
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
    try { execSync(`"${c}" -V`, { stdio: 'pipe' }); return c } catch { /* keep looking */ }
  }
  return null
}

function loadEnvVars(root) {
  const file = path.join(root, '.env')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim().replace(/^"?|"?$/g, '')
  }
  return out
}

function parseManifest(root) {
  const manifestPath = path.join(root, 'db', 'manifest.txt')
  if (!existsSync(manifestPath)) return []
  const entries = []
  for (const line of readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [file, target] = trimmed.split('|').map((s) => s.trim())
    if (file && target) entries.push({ file, target })
  }
  return entries
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
  const adminConn = `${env.ORACLE_ADMIN_USER ?? 'system'}/${env.ORACLE_ADMIN_PASSWORD ?? ''}@localhost:${port}/${service}`
  const appPass = env.ORACLE_PASSWORD ?? 'railnexus_dev'
  const zonePass = env.ORACLE_ZONE_PASSWORD ?? appPass

  if (!(await oracleUp(port))) {
    throw new Error('Oracle is not reachable. Use docker compose up -d --build, or fix .env.')
  }
  const sqlplus = findSqlplus()
  if (!sqlplus) {
    throw new Error('Oracle reachable but no sqlplus found; use the Oracle container to apply schema.')
  }

  const entries = parseManifest(root)
  if (entries.length === 0) throw new Error('db/manifest.txt is missing or empty')

  const zoneUsers = ['RAILNEXUS_NORTH', 'RAILNEXUS_WEST', 'RAILNEXUS_SOUTH']
  const runs = []
  for (const { file, target } of entries) {
    const targets = target === 'ZONEALL' ? zoneUsers : [target]
    for (const t of targets) {
      const user =
        t === '$SYS' ? null
          : t === 'RAILNEXUS' ? (env.ORACLE_USER ?? 'RAILNEXUS')
          : t
      const password =
        t === '$SYS' ? null
          : t === 'RAILNEXUS' ? appPass
          : zonePass
      const connect = t === '$SYS' ? adminConn : `${user}/${password}@localhost:${port}/${service}`
      runs.push({ file, t, connect, abs: path.join(root, 'db', file) })
    }
  }

  for (const { file, t, connect, abs } of runs) {
    log(`applying ${file} (as ${t})`)
    const cmd =
      process.platform === 'win32'
        ? `cmd /c echo exit | "${sqlplus}" -S -L ${connect} @${abs}`
        : `echo exit | "${sqlplus}" -S -L ${connect} @${abs}`
    try {
      execSync(cmd, { stdio: 'inherit', encoding: 'utf8' })
    } catch (err) {
      throw new Error(`Script failed: ${file} - ${err.message}`)
    }
  }
}