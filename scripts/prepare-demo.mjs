// Additive October demonstration setup. Requires the project's Oracle container.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { chmodSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'backend/package.json'))
require('dotenv').config({ path: path.join(root, 'backend/.env') })
function readable(dir) {
  chmodSync(dir, 0o755)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) readable(p)
    else chmodSync(p, 0o644)
  }
}
readable(path.join(root, 'db'))
const password = process.env.ORACLE_PASSWORD ?? 'railnexus_dev'
const zonePassword = process.env.ORACLE_ZONE_PASSWORD ?? password
function run(file, user, zone) {
  const p = path.parse(file)
  const sql = `WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK\nconnect ${user}/${user === 'RAILNEXUS' ? password : zonePassword}@//127.0.0.1:1521/FREEPDB1\n${zone === undefined ? '' : `DEFINE DEMO_ZONE_ID=${zone}\n`}@${p.base}\nexit\n`
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-w',
      `/opt/railnexus/${p.dir}`,
      'oracle',
      'sqlplus',
      '-s',
      '-L',
      '/nolog',
    ],
    {
      cwd: root,
      input: sql,
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    },
  )
  if (
    result.error ||
    result.status !== 0 ||
    /ORA-|PLS-|SP2-|Warning:/.test(result.stdout ?? '')
  ) {
    console.error(
      `Failed ${file} (${user})`,
      result.error?.message ?? result.stdout,
      result.stderr,
    )
    process.exit(1)
  }
  console.log(`Applied ${file} (${user})`)
}
for (const user of [
  'RAILNEXUS',
  'RAILNEXUS_NORTH',
  'RAILNEXUS_WEST',
  'RAILNEXUS_SOUTH',
]) {
  run('demo/booking_fixes.sql', user)
  run('plsql/pkg_booking.sql', user)
  run('plsql/pkg_payment.sql', user)
}
run('plsql/pkg_announcements.sql', 'RAILNEXUS')
run('demo/fare_rules.sql', 'RAILNEXUS')
for (const [user, zone] of [
  ['RAILNEXUS', 0],
  ['RAILNEXUS_NORTH', 1],
  ['RAILNEXUS_WEST', 2],
  ['RAILNEXUS_SOUTH', 3],
])
  run('demo/october_2026.sql', user, zone)
for (const user of ['RAILNEXUS_NORTH', 'RAILNEXUS_WEST', 'RAILNEXUS_SOUTH'])
  run('iot/seed_sensors.sql', user)
run('reporting/report_views.sql', 'RAILNEXUS')
// Baseline announcement uses the same authorization procedure as the station UI.
// Resolve from backend on Windows as well as Linux; a C:\ path is not an ESM URL.
const db = require('oracledb')
const conn = await db.getConnection({
  user: process.env.ORACLE_USER ?? 'RAILNEXUS',
  password,
  connectString: '127.0.0.1:1521/FREEPDB1',
})
try {
  const existing = await conn.execute(
    "SELECT COUNT(*) FROM station_announcement WHERE message LIKE 'October demo:%'",
  )
  if (existing.rows[0][0] === 0)
    await conn.execute(
      "BEGIN pkg_announcements.publish(103,'October demo: trains run daily from 1 to 30 October 2026. Please check your coach and berth before boarding.',2002,720,:id); END;",
      { id: { dir: db.BIND_OUT, type: db.NUMBER } },
    )
} finally {
  await conn.close()
}
console.log('October 2026 demonstration ready. Existing bookings preserved.')
