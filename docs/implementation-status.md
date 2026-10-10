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

## Phase 3: PL/SQL application packages (IMPLEMENTED, UNVERIFIED)

- [x] db/plsql/pkg_fare.sql — rate engine (base band + superfast surcharge, effective_from versioning), compute_fare + fare_breakdown
- [x] db/plsql/pkg_booking.sql — availability / book_ticket (CONFIRMED -> RAC -> WL FIFO) / cancel_ticket (frees seat, promotes first RAC); idempotent by request_id; SKIP LOCKED seat grab
- [x] db/plsql/pkg_payment.sql — record_payment (UPI/CARD/WALLET specialisation), capture_payment, request_refund; idempotent
- [x] db/plsql/pkg_tte.sql — list_schedule_tickets, board_ticket, on_board_count
- [x] db/plsql/outbox_audit_trigger.sql — booking_audit AFTER INSERT -> domain_outbox (same txn; 11g-safe payload)
- [x] db/zone_common/booking_family.sql: waitlist_queue is now per (schedule, class) FIFO (added coach_class)
- [x] manifest updated (pkg_fare/book/payment/tte/trigger -> RAILNEXUS + ZONEALL)
- [~] run on Oracle — BLOCKED (same blocker as Phase 1)

## Phase 4: Object-relational model (IMPLEMENTED, UNVERIFIED)

- [x] db/or/route_journey_types.sql — segment_t / segment_tab_t / route_journey_t (+ body, total_distance member)
- [x] db/or/route_journey_tab.sql — object table OF route_journey_t (nested segments storage), train_route_or REF table, population from relational source of truth
- [x] db/or/pkg_journey.sql — refresh_object_table, print_train_route (REF->DEREF->segments traversal), stops_between / distance_between, list_all_train_segments
- [~] run on Oracle — BLOCKED (same blocker as Phase 1)

## Phase 5: JSON / semi-structured + cross-store outbox (IMPLEMENTED, UNVERIFIED)

- [x] db/json/migrate_json_columns.sql — train.metadata_json, station_announcement.extra_json (11g-safe CHECK LIKE '{%}')
- [x] db/json/fare_rule_json.sql — seed fare_rule.fare_json from relational columns
- [x] db/json/pkg_json_rules.sql — REGEXP_SUBSTR JSON parser helpers + fare_for (no JSON_TABLE dependency; 12.2+ upgrade documented)
- [x] db/plsql/pkg_outbox.sql — mark_delivered/mark_failed/pending_count/schedule_retry (retry backoff, status N/S/F)
- [x] db/plsql/pkg_rules.sql — can_book_passenger_train (blocks freight), booking_limit_ok (max 6 active per passenger/train/day), enforce_booking_rules
- [x] pkg_booking.book_ticket now calls pkg_rules.enforce_booking_rules
- [x] backend/src/outbox/outboxRelay.ts — polls Oracle domain_outbox (status N, next_attempt <= SYSDATE), publishes to Redis (railnexus:outbox) and writes event snapshot to MongoDB 'outbox_events' (best-effort), marks delivered/failed via DB; relay opt-in via OUTBOX_RELAY_ENABLED
- [~] run on Oracle + Redis/Mongo — PARTIALLY BLOCKED (Oracle stopped; Redis/Mongo may be portable/binaries; see blockers)

## Phase 6: Redis cache + metadata catalogue API (IMPLEMENTED, UNVERIFIED)

- [x] backend/src/cache/redis.ts — RedisCache (JSON get/set with TTL, delByPrefix, atomic SET NX PX lock + token-checked release, ping); no-op when REDIS_ENABLED=false and degrades on runtime errors
- [x] backend/src/cache/keys.ts — namespaced key builders (rxn:avail/…, rxn:meta:…, rxn:fare:…, rxn:lock:…) + TTL table
- [x] backend/src/db/oracle.ts — shared RAILNEXUS pool + query() (OUT_FORMAT_OBJECT) + probeOracle()
- [x] backend/src/domain/fare.ts — pure fare math (band clamp + superfast surcharge), shared/testable, mirrors pkg_fare
- [x] backend/src/api/routes/metadata.ts — GET /api/metadata/{zones,stations,trains,routes/:id,fares} with Redis caching
- [x] backend/src/api/routes/health.ts — /ready now probes Oracle (SELECT 1 FROM DUAL), Redis and Mongo
- [x] backend/src/index.ts — mounts /api/metadata
- [x] tests/unit/cache.test.ts, tests/unit/fare.test.ts — 12 jest tests green
- [~] run against live Oracle/Redis/Mongo — BLOCKED (see blockers)

## Phase 7: IoT telemetry (IMPLEMENTED, UNVERIFIED)

- [x] db/zone_common/iot_family.sql — IOT_SENSOR / SENSOR_READING / SENSOR_ALERT (kind bands, newest-first index), included by shared + every zone
- [x] db/plsql/pkg_iot.sql — evaluate band rule, ingest_reading (read + threshold + alert in one txn), latest_value, list_open_alerts, acknowledge_alert (11g-safe ROWNUM top-N)
- [x] db/iot/seed_sensors.sql — one TEMP/SMOKE/DOOR/AQI sensor per coach, re-runnable (RAILNEXUS + ZONEALL)
- [x] db/mongo/init-timeseries.mjs — idempotent sensor_readings time-series collection + index
- [x] backend/src/domain/iot.ts — pure threshold logic mirroring pkg_iot.evaluate
- [x] backend/src/iot/iotService.ts — zone-routed ingest via pkg_iot + best-effort Mongo snapshot
- [x] backend/src/api/routes/iot.ts — POST /api/iot/readings, GET /sensors, /sensors/:id/latest, /alerts, POST /alerts/:id/ack (zod-validated)
- [x] backend/src/index.ts — mounts /api/iot; tests/unit/iot.test.ts (18 tests total green)
- [~] run on Oracle + Mongo — BLOCKED (OracleServiceXE stopped, no Docker)

## Phase 8: Reservation & auth API (IMPLEMENTED, UNVERIFIED)

- [x] backend/src/auth/tokens.ts — JWT sign/verify + claim normalisation (injectable secret)
- [x] backend/src/auth/service.ts — bcrypt credential check against PERSON + role resolution (passenger/tte/station_master/zone_admin/super_admin)
- [x] backend/src/api/middleware/auth.ts — requireAuth (Bearer) + requireRole guards
- [x] backend/src/api/routes/auth.ts — POST /api/auth/login (rate-limited) + GET /api/auth/me
- [x] backend/src/reservation/reservationService.ts — search, availability, book, pay, PNR lookup across zones, cancel, TTE list/board via pkg_booking/pkg_payment/pkg_tte
- [x] backend/src/api/routes/reservations.ts — public search/availability; authed book/pay/PNR/cancel; role-gated TTE endpoints
- [x] backend/src/domain/ticket.ts — coach-class + ticket-status helpers
- [x] tests/unit/tokens.test.ts + ticket.test.ts (27 tests total green); tsc + eslint green
- [~] run on Oracle — BLOCKED (OracleServiceXE stopped, no Docker)

## Phases 9-11: React UI, reporting, ops

- pending