# RailNexus

An academic, portfolio-grade railway reservation system built as a deliberate showcase of
advanced database management system concepts: EER modeling, PL/SQL, object-relational
features, distributed/zone databases, semi-structured data (JSON) and polyglot
persistence with Redis and MongoDB.

> All trains, stations, fares and passenger records in this repository are fictional
> sample data. RailNexus is not connected to IRCTC or to any live railway inventory.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Router, Context API |
| API | Node.js, Express, TypeScript, zod validation, raw node-oracledb (no ORM) |
| Primary RDBMS | Oracle Database (Free 23ai in Docker, or an existing local Oracle instance) |
| Distributed simulation | Three zone schemas (ZONE_NORTH, ZONE_WEST, ZONE_SOUTH) with database links |
| Cache / coordination | Redis (availability cache, distributed lock guard) |
| Semi-structured store | MongoDB (IoT telemetry time-series, analytics events) |
| Tests | Jest + Supertest (backend), Vitest (frontend) |

## Features

- Passenger search (cross-zone), availability, booking, payment, PNR lookup and cancel.
- TTE console (passenger manifest + boarding) and IoT alert dashboard (readings + ack).
- Admin reporting dashboard (revenue, occupancy, zone rollups) with a materialized view.
- JWT auth with RBAC (passenger / tte / station_master / zone_admin / super_admin).

See `docs/implementation-status.md` for the phase-by-phase build state. Database-backed
paths are implemented but **unverified** until a running Oracle/Redis/Mongo stack is
available (see *Verification* below).

## Repository layout

```
backend/   Node.js + Express + TypeScript API
frontend/  React + Vite SPA
db/        Oracle DDL, PL/SQL packages, seeds, manifest, docker-init bootstrap
docs/      Architecture and concept documentation
scripts/   Local dev orchestration (setup/start/stop/test/reset-demo)
.agent/    Autonomous build state (progress, decisions, command log)
```

## Quick start (Docker)

```bash
docker compose up --build
```

Brings up Oracle Free (`1521`), Redis (`6379`), MongoDB (`27017`), the API (`4000`) and
the SPA (`5173`). The Oracle container runs `db/docker-init/00_bootstrap.sql`, which
chains the whole `db/manifest.txt` (schemas, seeds, packages, views).

## Quick start (local Node services, external databases)

```bash
npm run setup    # scripts: installs deps, writes .env, applies DDL + seed, seeds Mongo
npm run start    # scripts: starts backend (4000) and frontend (5173)
npm run test     # scripts: lint + typecheck + unit tests
npm run reset-demo
```

The database is auto-detected at runtime: when Oracle is unreachable the API still boots,
`/health` reports the dependency as down, and data endpoints fail loudly instead of
fabricating results.

## October 2026 presentation

The demo covers **1–30 October 2026**, with six passenger trains daily, real seeded
bookings/payments, a waiting-list cancellation example, and distinct dashboards for
all five actors. After the database stack starts, run `npm run demo:prepare`.
**For a frontend-only presentation, start with [DEMO START HERE](docs/DEMO-START-HERE.md).**
The new **Live demo** page has separate two-seat practice trains, a shared passenger
board, visible WL/RAC promotion and a practice-only reset button. Quick login also
includes Meera, the second passenger. Normal bookings are preserved.

See [the presentation walkthrough](docs/demo-walkthrough.md) for exact role-by-role
steps, sample journeys, procedures/triggers to explain, and SQL evidence. Run
`npm run demo:verify` against the running API for the full regression scenario.

## Demo accounts

After seeding (`db/shared_ddl/02_seed_data.sql`), all accounts share the password
`Demo@123`:

| Email | Role |
|---|---|
| `passenger@railnexus.local` | passenger |
| `tte@railnexus.local` | tte |
| `station@railnexus.local` | station_master |
| `zoneadmin@railnexus.local` | zone_admin |
| `admin@railnexus.local` | super_admin |

## Verification

- Backend: `cd backend; npx tsc --noEmit; npx eslint src tests --ext .ts; npx jest`
- Frontend: `cd frontend; npm run build; npm run lint; npm run test`
- Full stack: start the Oracle Docker service, then `npm run setup && npm run start`.

## Documentation map

- `docs/architecture.md` — system architecture and data flow
- `docs/eer-diagram.md` — EER model (entities, keys, relationships)
- `docs/schema-notes.md` — schema design decisions
- `docs/distributed-architecture.md` — zone fragmentation, DB links, cross-zone booking
- `docs/oop-db-notes.md` — object-relational journey model and REF navigation
- `docs/nosql-justification.md` — Redis/MongoDB polyglot persistence rationale
- `docs/reporting-architecture.md` — OLTP vs OLAP, materialized view
- `docs/adbms-concepts-mapping.md` — concept → file index
- `docs/implementation-status.md` — phase checklist with commit hashes
