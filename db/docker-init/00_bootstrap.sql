-- =============================================================================
-- RailNexus docker-init master bootstrap.
-- The Oracle Free container runs this file on first start (empty volume).
-- It chains every RailNexus schema + seed + package script in the exact order of
-- db/manifest.txt using absolute paths inside /opt/railnexus (mounted from ./db).
--
-- Dev-only credentials below: this runs inside the disposable dev container.
-- The same SQL is applied to any local Oracle by scripts/dev-setup (manifest).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- If the image entrypoint connected at the CDB root, move into the Free PDB.
-- No-op (and ignored) when we are already inside FREEPDB1.
ALTER SESSION SET CONTAINER = FREEPDB1;

WHENEVER SQLERROR EXIT

PROMPT >>> bootstrap schemas (users, tablespaces, roles)
@/opt/railnexus/shared_ddl/00_bootstrap.sql

PROMPT >>> shared schema + seed
CONNECT RAILNEXUS/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/shared_ddl/01_core_schema.sql
@/opt/railnexus/shared_ddl/02_seed_data.sql

PROMPT >>> distributed architecture (DB links, federated views, cross-zone booking)
@/opt/railnexus/distributed/db_links.sql
@/opt/railnexus/distributed/distributed_views.sql
@/opt/railnexus/distributed/book_cross_zone_ticket.sql

PROMPT >>> shared PL/SQL packages (shared schema)
@/opt/railnexus/plsql/pkg_fare.sql
@/opt/railnexus/plsql/pkg_rules.sql
@/opt/railnexus/plsql/pkg_booking.sql
@/opt/railnexus/plsql/pkg_payment.sql
@/opt/railnexus/plsql/pkg_tte.sql
@/opt/railnexus/plsql/outbox_audit_trigger.sql

PROMPT >>> object-relational journey model
@/opt/railnexus/or/route_journey_types.sql
@/opt/railnexus/or/route_journey_tab.sql
@/opt/railnexus/or/pkg_journey.sql

PROMPT >>> JSON rules + durable outbox (shared schema)
@/opt/railnexus/json/migrate_json_columns.sql
@/opt/railnexus/json/fare_rule_json.sql
@/opt/railnexus/json/pkg_json_rules.sql
@/opt/railnexus/plsql/pkg_outbox.sql

PROMPT >>> IoT telemetry (shared schema)
@/opt/railnexus/plsql/pkg_iot.sql
@/opt/railnexus/iot/seed_sensors.sql

PROMPT >>> reporting / OLAP (shared schema)
@/opt/railnexus/reporting/report_views.sql
@/opt/railnexus/plsql/pkg_reporting.sql

-- ---------------------------------------------------------------------------
-- Zone schemas: schema (pulls zone_common), then the ZONEALL packages + seeds.
-- ---------------------------------------------------------------------------
PROMPT >>> zone NORTH
CONNECT RAILNEXUS_NORTH/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/zone_north/schema.sql
@/opt/railnexus/plsql/pkg_fare.sql
@/opt/railnexus/plsql/pkg_rules.sql
@/opt/railnexus/plsql/pkg_booking.sql
@/opt/railnexus/plsql/pkg_payment.sql
@/opt/railnexus/plsql/pkg_tte.sql
@/opt/railnexus/plsql/outbox_audit_trigger.sql
@/opt/railnexus/json/pkg_json_rules.sql
@/opt/railnexus/plsql/pkg_outbox.sql
@/opt/railnexus/plsql/pkg_iot.sql
@/opt/railnexus/iot/seed_sensors.sql

PROMPT >>> zone WEST
CONNECT RAILNEXUS_WEST/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/zone_west/schema.sql
@/opt/railnexus/plsql/pkg_fare.sql
@/opt/railnexus/plsql/pkg_rules.sql
@/opt/railnexus/plsql/pkg_booking.sql
@/opt/railnexus/plsql/pkg_payment.sql
@/opt/railnexus/plsql/pkg_tte.sql
@/opt/railnexus/plsql/outbox_audit_trigger.sql
@/opt/railnexus/json/pkg_json_rules.sql
@/opt/railnexus/plsql/pkg_outbox.sql
@/opt/railnexus/plsql/pkg_iot.sql
@/opt/railnexus/iot/seed_sensors.sql

PROMPT >>> zone SOUTH
CONNECT RAILNEXUS_SOUTH/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/zone_south/schema.sql
@/opt/railnexus/plsql/pkg_fare.sql
@/opt/railnexus/plsql/pkg_rules.sql
@/opt/railnexus/plsql/pkg_booking.sql
@/opt/railnexus/plsql/pkg_payment.sql
@/opt/railnexus/plsql/pkg_tte.sql
@/opt/railnexus/plsql/outbox_audit_trigger.sql
@/opt/railnexus/json/pkg_json_rules.sql
@/opt/railnexus/plsql/pkg_outbox.sql
@/opt/railnexus/plsql/pkg_iot.sql
@/opt/railnexus/iot/seed_sensors.sql

PROMPT RailNexus docker bootstrap complete
