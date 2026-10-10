# ADBMS concept map

Where each advanced-database concept required by the brief is actually implemented.
Paths are relative to the repository root.

| Concept | Implementation |
|---|---|
| EER modelling (generalisation/specialisation) | `docs/eer-diagram.md`, `db/shared_ddl/01_core_schema.sql` (`person`/`passenger`/`employee` table-per-subtype) |
| Referential integrity & constraints | `db/shared_ddl/01_core_schema.sql`, `db/zone_common/booking_family.sql` |
| SQL (multi-table joins, aggregates, `CASE`, `ROWNUM`) | `db/plsql/*.sql`, `backend/src/reporting/reportingService.ts` |
| PL/SQL (packages, procedures, functions, exceptions) | `db/plsql/pkg_fare.sql`, `pkg_booking.sql`, `pkg_payment.sql`, `pkg_tte.sql`, `pkg_rules.sql`, `pkg_iot.sql`, `pkg_reporting.sql` |
| Triggers | `db/plsql/outbox_audit_trigger.sql` (audit/outbox capture) |
| Cursors | Ref-cursor report procedures in `db/plsql/pkg_reporting.sql`, package specs |
| Stored procedures/functions | Every `pkg_*` package spec/body |
| Object-relational features (object types, `REF`, nested tables) | `db/or/route_journey_types.sql`, `route_journey_tab.sql`, `db/or/pkg_journey.sql` |
| Distributed databases (DB links, federated queries, 2PC semantics) | `db/distributed/db_links.sql`, `distributed_views.sql`, `book_cross_zone_ticket.sql` |
| Distributed fragmentation (horizontal by zone) | `db/zone_north/`, `db/zone_west/`, `db/zone_south/`, `db/zone_common/substitution rule` |
| Semi-structured data (JSON in a relational store) | `db/json/migrate_json_columns.sql`, `fare_rule_json.sql`, `db/plsql/pkg_json_rules.sql` |
| NoSQL (document / time-series) | `db/mongo/init-timeseries.mjs`, `backend/src/iot/iotService.ts` |
| Key-value caching & distributed locking | `backend/src/cache/redis.ts`, `backend/src/cache/keys.ts` |
| OLAP / OLTP separation, materialized views | `db/reporting/report_views.sql`, `db/plsql/pkg_reporting.sql`, `backend/src/reporting/reportingService.ts` |
| Transaction management & isolation | `pkg_booking`/`pkg_payment` transactional booking + payment; `pkg_outbox` transactional outbox |
| Concurrency control | Seat/segment inventory with `SELECT ... FOR UPDATE`, Redis lock guard (`cache/redis.ts`) |
| Recovery / durability | Durable outbox + relay (`db/plsql/pkg_outbox.sql`, `backend/src/outbox/outboxRelay.ts`) |
| Security (auth, roles, RBAC) | `backend/src/auth/*`, `backend/src/api/middleware/auth.ts` |
| Data warehousing / OLAP aggregation | `reporting/report_views.sql`, MongoDB aggregation in `reportingService.ts` |
| Schema management / migrations | `db/manifest.txt` + `scripts/lib/load-oracle.mjs`, `db/docker-init/00_bootstrap.sql` |
