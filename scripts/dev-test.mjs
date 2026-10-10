// RailNexus test script: typecheck + lint + unit tests (backend), build + lint (frontend).
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, cwd) => {
  console.log(`\n>>> ${cmd}  (in ${path.relative(root, cwd)})`)
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } })
}

console.log('== backend typecheck ==')
run('npm run typecheck', path.join(root, 'backend'))
console.log('== backend lint ==')
run('npm run lint', path.join(root, 'backend'))
console.log('== backend tests ==')
run('npm run test', path.join(root, 'backend'))
console.log('== frontend typecheck ==')
run('npm run typecheck', path.join(root, 'frontend'))
console.log('== frontend lint ==')
run('npm run lint', path.join(root, 'frontend'))
console.log('== frontend build ==')
run('npm run build', path.join(root, 'frontend'))

console.log('\n[test] all checks passed')