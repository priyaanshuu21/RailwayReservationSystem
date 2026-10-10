# Implementation status (Phase 0 scaffolding)

- [ ] Phase 0: repository scaffolding
  - [x] directory structure
  - [x] backend TypeScript project (strict tsconfig, express, oracledb, ioredis, mongodb, zod)
  - [x] frontend Vite React-TS + Tailwind
  - [x] docker-compose.yml (oracle-free, redis, mongo, backend, frontend, named volumes)
  - [x] docs/architecture.md
  - [x] scripts (setup/start/stop/test/reset-demo)
  - [ ] typecheck + lint green
  - [ ] committed and pushed

Evidence commands: `npm run typecheck` in backend + frontend, `npm run lint` in both.