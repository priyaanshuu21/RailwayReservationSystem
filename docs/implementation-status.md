# Implementation status

Legend: `[x] done` | `[~] implemented, runtime verification blocked (no Oracle service here)`

## Phase 0: Repository scaffolding (VERIFIED, commit ee5c46d)

- [x] monorepo structure (backend, frontend, db, docs, scripts, .agent)
- [x] backend TypeScript project (strict tsconfig, express, oracledb, ioredis, mongodb, zod, jest+ts-jest, eslint+oxlint)
- [x] frontend Vite React-TS + Tailwind (pinned React 18 / Vite 5 / TS 5.5)
- [x] docker-compose.yml (oracle-free 23ai, redis, mongo, backend, frontend, named volumes)
- [x] docs/architecture.md
- [x] scripts (setup / start / stop / test / reset-demo, manifest-driven Oracle loader)
- [x] typecheck + lint green (backend + frontend) and jest smoke test green
- [x] committed and pushed to origin/main

## Phase 1: Shared EER schema + reference/seed data (IMPLEMENTED, UNVERIFIED)

- [x] docs/eer-diagram.md — conceptual/relational EER diagrams (mermaid)
- [x] docs/schema-notes.md — table inventory, identity strategy, ordering, decisions
- [x] db/shared_ddl/00_bootstrap.sql — drop/recreate RAILNEXUS, 3 zone users, REPORTING
- [x] db/shared_ddl/01_core_schema.sql — ZONE, STATION, PERSON/EMPLOYEE/PASSENGER + role subtypes, TRAIN + 4 subtypes, ROUTE/STATION_ROUTE/TRAIN_ROUTE, FARE_RULE, TTE_ASSIGNMENT, STATION_ANNOUNCEMENT
- [x] db/zone_common/booking_family.sql — SCHEDULE/COACH/SEAT/SEAT_SEGMENT/BOOKING/TICKET+subtypes/PAYMENT+subtypes/REFUND/FARE_BREAKUP/OUTBOX (included by shared + every zone)
- [x] db/zone_common/seed_helper.sql — deterministic coach/seat generator (shared trigger/sequence compatible)
- [x] db/shared_ddl/02_seed_data.sql — zones, 10 stations, 8 trains (all 4 subtypes), 6 routes, stops, fare rules, 10 passengers + 5 employees, schedules/coaches/seats for 21 days, TTE duties
- [x] db/zone_{north,west,south}/schema.sql — zone deploy scripts (DEFINE ZONE_CODE)
- [x] db/docker-init/00_bootstrap.sql — container first-start schema bootstrap
- [x] db/manifest.txt — apply order and target schemas
- [~] DDL execution + seed verification on Oracle — BLOCKED (OracleServiceXE stopped, no Docker, no elevation)

Evidence (would-be): `scripts/lib/load-oracle.mjs` manifest loader; `npm run dev-test` smoke tests. Not runnable here.

## Phase 2: Distributed architecture (IMPLEMENTED, UNVERIFIED)

- [x] docs/distributed-architecture.md — layout, fragmenting rule, 2PC seam
- [x] db/distributed/db_links.sql — ZONE_* DB links (shared + between zones), `&DB_SERVICE` override
- [x] db/distributed/distributed_views.sql — vw_all_zone_schedules, vw_zone_inventory, vw_zone_coaches, vw_train_catalog
- [x] db/distributed/book_cross_zone_ticket.sql — pkg_cross_zone TCP/IP-style cross-zone booking + demo
- [x] backend/src/db/zoneRouter.ts + db/index.ts — station/zone -> owning schema, lazy per-zone pools
- [x] backend typecheck + lint + jest green; oracledb.minimal.d.ts added (oracledb 6.x ships no types)
- [~] run on Oracle — BLOCKED (same blocker as Phase 1)

## Phases 3-11: PL/SQL, object-relational, JSON/Semi-struct, IoT/app, React UI, reporting, ops

- pending