# RailNexus

An academic, portfolio-grade railway reservation system built as a deliberate showcase of
advanced database management system concepts: EER modeling, PL/SQL, object-relational
features, distributed/zone databases, semi-structured data (JSON/XML) and polyglot
persistence with Redis and MongoDB.

> All trains, stations, fares and passenger records in this repository are fictional
> sample data. RailNexus is not connected to IRCTC or to any live railway inventory.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Redux Toolkit (RTK Query), React Router |
| Realtime | Socket.IO (live seat map and waitlist deltas) |
| API | Node.js, Express, TypeScript, zod validation, raw node-oracledb (no ORM) |
| Primary RDBMS | Oracle Database (Free 23ai in Docker, or an existing local Oracle instance) |
| Distributed simulation | Three zone schemas (ZONE_NORTH, ZONE_WEST, ZONE_SOUTH) with database links |
| Cache / coordination | Redis (availability cache, distributed lock guard, session store, jobs) |
| Semi-structured store | MongoDB (audit trail, notification templates, analytics events) |
| Tests | Jest + Supertest (API), PL/SQL block tests, Playwright (E2E) |

## Repository layout

```
/backend        Express + TypeScript API, PL/SQL sources, distributed + NoSQL adapters
/db             Oracle DDL: shared schema, per-zone schemas, seed data, docker init
/docs           Architecture, EER model, distribution, OOP, NoSQL and reporting notes
/frontend       React SPA (passenger, TTE, station master, zone admin, super admin)
/scripts        Cross-platform Node scripts for setup, start, stop, test, demo reset
/.agent         Agent progress, handoff, decisions and command log (state files)
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

- Frontend: http://localhost:5173
- API: http://localhost:4000 (health at `/health/live` and `/health/ready`)
- Oracle: `localhost:1521`, service `FREEPDB1`
- Redis: `localhost:6379`, Mongo: `localhost:27017`

Then load the demo data: `npm run setup --prefix scripts` (re-runnable, see below).

## Quick start (local Node services, external databases)

```bash
npm run setup    # scripts: installs deps, writes .env, applies DDL + seed, seeds Mongo
npm run start    # scripts: starts backend (4000) and frontend (5173)
npm run test     # scripts: lint + typecheck + unit/integration tests
```

Database availability is detected at runtime. When Oracle is unreachable the API stays
up, `/health/ready` reports `oracle: down`, and data endpoints return `503` with a clear
message instead of silently pretending to work.

## Demo logins

See `docs/README` section "Demo accounts" after running the seed script
(`db/shared_ddl/02_seed_data.sql`), or query `PERSON`/`EMPLOYEE` after setup.

## Documentation map

- `docs/architecture.md` - three-tier architecture, zone distribution, ADBMS concept map
- `docs/eer-diagram.md` - Mermaid EER model with cardinality and constraints
- `docs/schema-notes.md` - why table-per-subtype was chosen
- `docs/distribution-strategy.md` - partitioning vs federation, DB links, 2PC simulation
- `docs/oop-db-notes.md` - object types and when object-relational modeling pays off
- `docs/nosql-justification.md` - polyglot persistence reasoning
- `docs/reporting-architecture.md` - OLTP vs OLAP separation
- `docs/adbms-concepts-mapping.md` - syllabus concept to implementation file index
- `docs/implementation-status.md` - phase checklist with evidence
