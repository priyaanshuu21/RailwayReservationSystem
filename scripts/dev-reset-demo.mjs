// RailNexus demo data reset. EXPLICITLY OPT-IN.
// Asks for a matching confirmation word before deleting demo data. Does nothing otherwise.
import { createInterface } from 'node:readline/promises'
import { execSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const flag = process.argv.find((a) => a === '--yes' || a === '-y')
if (!flag) {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(
    'WARNING: this deletes all RailNexus demo bookings, tickets, seats and re-seeds ' +
    'core reference data in Oracle and MongoDB. This cannot be undone.\n' +
    'Type RESET-DEMO to continue: '
  )
  rl.close()
  if (answer.trim() !== 'RESET-DEMO') {
    console.log('[reset] cancelled')
    process.exit(0)
  }
}

console.log('[reset] stopping services so no writer interferes')
execSync('node scripts/dev-stop.mjs', { cwd: root, stdio: 'inherit' })

console.log('[reset] re-applying schema and seed data (idempotent)')
await import('./lib/load-oracle.mjs')
  .then((m) => m.applySchemaAndSeed(root, (msg) => console.log(`[reset] ${msg}`)))
  .catch((err) => console.error(`[reset] ${err.message}`))

console.log('[reset] demo data is fresh. Start with:  npm start')