// RailNexus stop script. Terminates processes recorded in .agent/tmp/*.pid.
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = path.join(root, '.agent', 'tmp')

for (const name of ['backend', 'frontend']) {
  const pidFile = path.join(tmp, `${name}.pid`)
  if (!existsSync(pidFile)) continue
  const pid = Number(readFileSync(pidFile, 'utf8').trim())
  if (process.platform === 'win32') {
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }) } catch { try { process.kill(pid) } catch { /* ignore */ } }
  } else {
    try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
  }
  try { unlinkSync(pidFile) } catch { /* ignore */ }
  console.log(`[stop] stopped ${name} (pid ${pid})`)
}
console.log('[stop] done')