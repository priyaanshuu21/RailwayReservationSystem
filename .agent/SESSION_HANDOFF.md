# RailNexus session handoff

Resume by reading this file, `.agent/progress.json`, `.agent/decisions.md`, `git status`
and the code itself. State files are hints, not proof.

## Environment facts (verified)

- OS win32, PowerShell 5.1, Node 22.19, npm 10.9. git 2.52. No Docker, no WSL.
- Oracle 11.2 XE is installed (`C:\oraclexe`) but `OracleServiceXE` is Stopped and
  cannot be started without administrator elevation. `sqlplus` works as a client.
- No Redis or MongoDB installed. Fetch portable binaries under `.tools/` or use
  npm-managed memory servers when tests need them.
- npm registry reachable. GitHub remote is reachable (credentials OK, repo empty).
- npm package is `oracledb` (renamed from `node-oracledb`). Pinned `^6.8.0` (6.10.0 installed).

## Decisions taken

1. Frontend pinned to React 18 + Vite 5 + TS 5.5 + Tailwind 3 (the template shipped
   Vite 8 / React 19 / TS 6, which is bleeding edge and riskier; spec favors React 18).
2. `docker-compose.yml` uses `gvenzl/oracle-free:23-slim`; init scripts auto-run on
   first start; all SQL is written re-runnable anyway.
3. Backend compile/typecheck targets are real validation right now; Oracle runtime
   verification depends on resolving the elevation blocker.

## Commands to resume

- `npm run setup`  - install deps, create .env, load DDL+seed if Oracle reachable
- `npm start`      - background backend (4000) + frontend (5173)
- `npm run test`   - typecheck + lint + tests both apps
- `docker compose up -d --build` - full stack when Docker is available

## Outstanding issues

- Oracle runtime: blocked (elevation). Everything Oracle-specific must be written and
  reviewed but cannot be executed here. Do not mark DB-dependent phases verified.