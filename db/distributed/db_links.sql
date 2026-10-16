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
--
-- Note: Oracle has no CREATE OR REPLACE DATABASE LINK, so the links are dropped
-- and re-created to keep this script re-runnable.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- Default local service (docker oracle-free). Local XE installs should
-- pre-define DB_SERVICE=XE to target the local instance instead.
DEFINE DB_SERVICE = FREEPDB1

-- Drop any existing federation links so re-runs start clean.
DECLARE
  v_dummy NUMBER;
BEGIN
  FOR l IN (SELECT db_link FROM user_db_links WHERE db_link LIKE 'ZONE\_%' ESCAPE '\') LOOP
    EXECUTE IMMEDIATE 'DROP DATABASE LINK "' || l.db_link || '"';
  END LOOP;
END;
/

CREATE DATABASE LINK ZONE_NORTH
  CONNECT TO RAILNEXUS_NORTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE DATABASE LINK ZONE_WEST
  CONNECT TO RAILNEXUS_WEST IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';
CREATE DATABASE LINK ZONE_SOUTH
  CONNECT TO RAILNEXUS_SOUTH IDENTIFIED BY railnexus_dev USING '&DB_SERVICE';

-- Point-to-point zone-to-zone links (used by zone-local cross-zone helpers) are
-- created from each zone schema by the per-zone deployment steps, which connect
-- as that zone. They are intentionally not created here: this script runs as
-- RAILNEXUS and cannot create objects in the zone schemas.

-- Sanity: can the shared schema see every zone's inventory through its links?
SELECT 'NORTH' zone, COUNT(*) schedules_remote FROM train_schedule@ZONE_NORTH
UNION ALL
SELECT 'WEST', COUNT(*) FROM train_schedule@ZONE_WEST
UNION ALL
SELECT 'SOUTH', COUNT(*) FROM train_schedule@ZONE_SOUTH;

WHENEVER SQLERROR EXIT
PROMPT DB links created
