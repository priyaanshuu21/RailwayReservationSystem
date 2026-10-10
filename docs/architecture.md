# RailNexus Architecture

This document describes the RailNexus architecture: a strict three-tier client-server
system whose backend is built around Oracle Database as the authoritative store, with
Redis and MongoDB in supporting roles. Every "advanced DBMS" concept in the syllabus is
implemented as the natural solution to a real railway problem, not bolted on.

## 1. Three-tier client-server architecture

```
+----------------------+      HTTP / JSON + WebSocket       +-------------------------------------+
|  1. Client tier      | ----------------------------------> |  2. Application tier                 |
|  React 18 SPA        | <---------------------------------- |  Express + TypeScript API            |
|  (Vite + RTK Query)  |     REST /api/*, /socket.io/*      |  routes -> controllers -> services   |
+----------------------+                                     |  services -> repositories (SQL only) |
                                                             +----------------+--------------------+
                                                             |             (param. SQL only)        |
                                                             +----------------v--------------------+
                                                             |  3. Data tier                        |
                                                             |  Oracle (authoritative, PL/SQL)     |
                                                             |  Redis (cache, locks, sessions)     |
                                                             |  MongoDB (audit, templates, events) |
                                                             +-------------------------------------+
```

- The browser never connects to a database server. It only speaks REST and WebSocket to
  the API.
- Controllers perform validation and response shaping only. Services orchestrate business
  flows. Repositories are the only layer allowed to touch `oracledb` directly, and every
  statement is bind-variable based. No SQL is concatenated from user input.
- All transactional business logic lives in PL/SQL packages inside Oracle
  (`backend/src/plsql`), called by repositories. The Node layer never re-implements
  seat-allocation or cancellation logic.

## 2. Zone distribution strategy

Indian Railways is organized into geographic zones. RailNexus mirrors that: the database
is logically fragmented horizontally over three zone stores, ZONE_NORTH, ZONE_WEST and
ZONE_SOUTH. Each zone owns the schedule, coaches, seats and bookings for the trains that
originate in that zone.

Two complementary demonstrations are built (details in `distribution-strategy.md`):

1. **Distributed by partitioning.** The shared-schema master tables show Oracle's native
   `PARTITION BY LIST (zone_id)` so a single table is stored in multiple segment
   partitions while still being queryable as one object.
2. **Distributed by federation.** The three zone *schemas* are true separate logical
   databases. Oracle database links let any zone query the others, a distributed view
   `ALL_ZONES_TRAIN_SCHEDULE` unions the remote schedules, and the cross-zone booking
   procedure simulates a two-phase commit (prepare both sides, commit or roll back both).

The Node backend contains a zone router (`backend/src/distributed/zoneRouter.ts`) that
picks the correct connection pool per request based on the train's zone, which is classic
application-level distributed query routing.

## 3. ADBMS concept to implementation map

| Concept | Where it lives in RailNexus |
|---|---|
| EER modeling (specialization/generalization) | `db/shared_ddl/01_core_schema.sql`, `docs/eer-diagram.md` |
| PL/SQL procedures, triggers, row locking | `backend/src/plsql/booking_pkg.sql`, `triggers.sql`, `fare_pkg.sql` |
| Distributed / parallel database | `db/zone_{north,west,south}/*`, `backend/src/plsql/distributed_booking.sql` |
| Object-oriented database | `backend/src/plsql/object_types.sql`, `oop_examples.sql` |
| Client-server architecture | This document, the whole `backend/src/api` layer |
| Databases on the web | REST/JSON + Socket.IO API, XML manifest endpoint, OpenAPI spec |
| Semi-structured data | Oracle JSON columns + XMLTYPE, `backend/src/plsql/semi_structured.sql` |
| NoSQL integration | `backend/src/nosql/redisClient.ts`, `mongoClient.ts` |
| Query optimization | Index strategy in DDL, materialized views (Phase 10) |
| Concurrency control | `FOR UPDATE SKIP LOCKED` in `booking_pkg`, optimistic version columns |
| Data warehousing | `reporting` star schema + ETL in `backend/src/plsql/reporting_mart.sql` |

## 4. Repository module mapping

| Folder | Responsibility |
|---|---|
| `db/shared_ddl` | Versioned, re-runnable shared Oracle DDL and deterministic seed data |
| `db/zone_north` `db/zone_west` `db/zone_south` | Identical per-zone DDL (horizontal fragmentation) |
| `db/docker-init` | Bootstrap scripts the Oracle container runs on first start |
| `backend/src/plsql` | All PL/SQL: packages, triggers, object types, XML/JSON, reporting |
| `backend/src/distributed` | DB-link config and the application-level zone router |
| `backend/src/nosql` | Redis and MongoDB client wrappers, outbox consumers |
| `backend/src/api` | HTTP + WebSocket layer: routes, controllers, middleware |
| `backend/src/services` | Use-case orchestration (booking, cancellation, notifications) |
| `backend/src/repositories` | Raw parameterized SQL/PL/SQL calls (the only DB-touching layer) |
| `frontend/src` | React SPA: shared components, role views, RTK Query API slice |

## 5. Data integrity and authority rules

- **Oracle is authoritative** for seat inventory, bookings, payment state and
  transactionality. Redis is a cache/coordination aid and never the final record of a
  seat. MongoDB stores audit/history and genuinely schema-flexible auxiliary data.
- Seats are reserved for a **specific journey date and occupied station segment**, not
  globally. Booking procedures validate overlapping route segments, class quotas, RAC
  capacity and waitlist order.
- Redis distributed locks are a fast-fail first-line guard only. The `FOR UPDATE`
  row lock in Oracle remains the source of truth and prevents overselling.
- Cross-store events (Oracle -> Mongo mirror, notifications) go through a durable
  transactional outbox with a retryable worker, not uncoordinated dual writes.

## 6. Honest simulation statements

- Payments are a local, clearly labeled simulated gateway. No real card data is accepted,
  no real bank is contacted.
- Cross-zone bookings use a compensating/simulated two-phase-commit pattern. Oracle
  database links do not give distributed two-phase commit as a free feature, so the
  procedure locks and verifies both sides and then commits or rolls back explicitly.
- Oracle Free is a single instance. "Zones" are separate schemas inside it (and
  optionally separate pluggable databases), which faithfully simulates horizontal
  fragmentation; it is documented as a simulation rather than three physical servers.

## 7. Observability

- `/health/live` and `/health/ready` report service and dependency state.
- Structured logs (Winston) with request ids and secret-safe redaction.
- Every failure returns the consistent error shape `{code, message, details}`.