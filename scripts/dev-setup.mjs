// RailNexus setup script. Cross-platform (Node >= 20).
// - ensures .env exists from .env.example
// - installs backend + frontend dependencies
// - detects local services (Oracle / Redis / Mongo) and reports readiness
import { execSync } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const log = (msg) => console.log(`[setup] ${msg}`)

function run(cmd, cwd) {
  log(`running: ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } })
}

function probe(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

function loadEnv() {
  const file = path.join(root, '.env')
  if (!existsSync(file)) {
    log('creating .env from .env.example (edit it to match your environment)')
    copyFileSync(path.join(root, '.env.example'), file)
  }
}

async function main() {
  loadEnv()
  mkdirSync(path.join(root, '.agent', 'tmp'), { recursive: true })

  log('installing backend dependencies')
  run('npm install', path.join(root, 'backend'))
  log('installing frontend dependencies')
  run('npm install', path.join(root, 'frontend'))

  log('probing local services')
  const oracle = await probe('127.0.0.1', 1521)
  const redis = await probe('127.0.0.1', 6379)
  const mongo = await probe('127.0.0.1', 27017)
  log(`oracle:1521 ${oracle ? 'reachable' : 'NOT reachable'}`)
  log(`redis:6379 ${redis ? 'reachable' : 'NOT reachable'}`)
  log(`mongo:27017 ${mongo ? 'reachable' : 'NOT reachable'}`)

  if (oracle) {
    await import('./lib/load-oracle.mjs')
      .then((m) => m.applySchemaAndSeed(root, log))
      .catch((err) => log(`oracle schema load failed: ${err.message}`))
  } else {
    log('oracle down. schema load skipped. start the database and re-run, or use docker compose.')
  }

  console.log('\n[setup] Dependencies installed. Next step:  npm start')
  console.log('[setup] If the database containers are not running, run:  docker compose up -d --build')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})