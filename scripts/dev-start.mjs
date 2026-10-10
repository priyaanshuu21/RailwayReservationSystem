// RailNexus start script. Launches backend + frontend as background processes.
// Use scripts/dev-stop.mjs to stop them. PID + log files live in .agent/tmp.
import { spawn } from 'node:child_process'
import net from 'node:net'
import { writeFileSync, mkdirSync, existsSync, appendFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = path.join(root, '.agent', 'tmp')
mkdirSync(tmp, { recursive: true })

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function start(name, cwd, args) {
  const out = path.join(tmp, `${name}.log`)
  const pidFile = path.join(tmp, `${name}.pid`)
  const child = spawn(npm, args, { cwd, detached: false, stdio: ['ignore', 'pipe', 'pipe'] })
  writeFileSync(out, '', 'utf8')
  child.stdout.on('data', (d) => appendFileSync(out, d))
  child.stderr.on('data', (d) => appendFileSync(out, d))
  writeFileSync(pidFile, String(child.pid), 'utf8')
  console.log(`[start] ${name} running (pid ${child.pid}). Log: ${out}`)
  child.on('exit', (code) => {
    console.log(`[start] ${name} exited with code ${code}`)
    try { unlinkSync(pidFile) } catch { /* ignore */ }
  })
  return child
}

function waitFor(port, ms = 60000) {
  const deadline = Date.now() + ms
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); resolve() })
      s.once('error', () => {
        s.destroy()
        if (Date.now() > deadline) reject(new Error(`port ${port} did not open in time`))
        else setTimeout(tick, 500)
      })
    }
    tick()
  })
}

if (existsSync(path.join(tmp, 'backend.pid'))) {
  console.log('[start] backend already running; run npm run stop first')
  process.exit(1)
}

start('backend', path.join(root, 'backend'), ['run', 'dev'])
waitFor(4000).then(() => {
  start('frontend', path.join(root, 'frontend'), ['run', 'dev'])
  console.log('[start] API:    http://localhost:4000')
  console.log('[start] UI:     http://localhost:5173')
}).catch((err) => {
  console.error(`[start] ${err.message}`)
})