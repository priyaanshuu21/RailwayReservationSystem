# Command log (secrets redacted)

| When (UTC) | Command | Result |
|---|---|---|
| 2026-10-10 08:00 | environment probe (node/npm/docker/git) | node 22, npm 10, docker absent |
| 2026-10-10 08:03 | probe Oracle/Redis/Mongo ports | 1521 open, 6379/27017 closed |
| 2026-10-10 08:04 | `git ls-remote` origin | OK (empty repo, creds work) |
| 2026-10-10 08:05 | `Start-Service OracleServiceXE` | FAIL: access denied (non-elevated shell) |
| 2026-10-10 08:06 | `sqlplus / as sysdba` startup | ORA-12560 (instance down, no local auth) |
| 2026-10-10 08:10 | `npm create vite@latest frontend -- --template react-ts` | OK |
| 2026-10-10 08:12 | frontend `npm install` | OK |
| 2026-10-10 08:20 | backend `npm install` (node-oracledb 6.5.1) | FAIL ETARGET; fixed to `oracledb@^6.8.0` |
| 2026-10-10 08:22 | backend `npm install` | OK (oracledb 6.10.0) |