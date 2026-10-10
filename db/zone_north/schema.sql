-- =============================================================================
-- RailNexus - ZONE_NORTH schema + seed.
-- Applies the shared zone-common DDL and seeds inventory for trains originating
-- in the Northern Railway zone. Runs as RAILNEXUS_NORTH.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DEFINE ZONE_CODE = NR

@@../zone_common/schema.sql