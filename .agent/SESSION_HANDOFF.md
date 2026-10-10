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

- Oracle runtime: blocked (elevation). Everything Oracle-specific is written and
  reviewed but cannot be executed here. DB-dependent phases stay `implemented_unverified`.
- Redis/Mongo absent. Their paths typecheck + unit-test only.

## Status: all 12 phases implemented (build complete)

Commits: 0 `ee5c46d`, 1 `23369a1`, 2 `7d8839b`, 3 `a01cd1c`, 4 `b82c4e0`,
5 `f5b675e`, 6 `79c0af5`, 7 `b59102c`, 8 `0a566d5`, 9 `266407e`, 10 `09e9488`,
11 `c6e088b`. All pushed to `origin/main`.

To verify at runtime (the only remaining work):

1. Start a database stack — either run `docker compose up --build`, or start
   `OracleServiceXE` as administrator and install Redis/Mongo.
2. `npm run setup` (loads `db/manifest.txt` then seeds Mongo).
3. `npm run test` (backend 31 Jest tests, frontend 2 Vitest tests) and exercise the
   API/UI; promote phase statuses from `implemented_unverified` to `verified`.