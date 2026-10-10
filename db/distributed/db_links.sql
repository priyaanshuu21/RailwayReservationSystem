-- =============================================================================
-- RailNexus - Phase 2: DB links between the shared schema and the zone schemas.
-- Created in RAILNEXUS (shared/federation schema). Each link connects to the
-- zone owner schema using its bootstrap password (railnexus_dev).
--
-- On a single-instance install every schema lives in the same database, so the
-- links resolve through the local service. They still route queries THROUGH the
-- DB-link machinery and the distributed optimizer, which is exactly the escape
-- hatch a real RailNexus deployment would use: point the links at remote
-- services (2PC via Oracle distributed transactions) without changing any
-- application code.
--
-- Service name defaults to FREEPDB1 (docker oracle-free). For a local 11g XE
-- install override it before running, e.g. in the loader or with:
--     DEFINE DB_SERVICE = XE
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- Default local service (docker oracle-free). Local XE installs should
-- pre-define DB_SERVICE=XE to target the local instance instead.
DEFINE DB_SERVICE = FREEPDB1

CREATE OR REPLACE DATABASE LINK ZONE_NORTH
  CONNECT TO RAILNEXUS_NORTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE OR REPLACE DATABASE LINK ZONE_WEST
  CONNECT TO RAILNEXUS_WEST IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE OR REPLACE DATABASE LINK ZONE_SOUTH
  CONNECT TO RAILNEXUS_SOUTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';

-- Point-to-point links between the zones themselves, used by the zone-local
-- cross-zone booking helper and the rollout scripts.
CONNECT RAILNEXUS_WEST/railnexus_dev
CREATE OR REPLACE DATABASE LINK ZONE_NORTH
  CONNECT TO RAILNEXUS_NORTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE OR REPLACE DATABASE LINK ZONE_SOUTH
  CONNECT TO RAILNEXUS_SOUTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';

CONNECT RAILNEXUS_NORTH/railnexus_dev
CREATE OR REPLACE DATABASE LINK ZONE_WEST
  CONNECT TO RAILNEXUS_WEST IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE OR REPLACE DATABASE LINK ZONE_SOUTH
  CONNECT TO RAILNEXUS_SOUTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';

CONNECT RAILNEXUS_SOUTH/railnexus_dev
CREATE OR REPLACE DATABASE LINK ZONE_WEST
  CONNECT TO RAILNEXUS_WEST IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE OR REPLACE DATABASE LINK ZONE_NORTH
  CONNECT TO RAILNEXUS_NORTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';

-- Sanity: can the shared schema see every zone's inventory through its links?
CONNECT RAILNEXUS/railnexus_dev
SELECT 'NORTH' zone, COUNT(*) schedules_remote FROM train_schedule@ZONE_NORTH
UNION ALL
SELECT 'WEST', COUNT(*) FROM train_schedule@ZONE_WEST
UNION ALL
SELECT 'SOUTH', COUNT(*) FROM train_schedule@ZONE_SOUTH;

WHENEVER SQLERROR EXIT
PROMPT DB links created