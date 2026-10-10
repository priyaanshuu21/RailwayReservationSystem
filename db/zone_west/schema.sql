-- =============================================================================
-- RailNexus - ZONE_WEST schema + seed.
-- Applies the shared zone-common DDL and seeds inventory for trains originating
-- in the Western Railway zone. Runs as RAILNEXUS_WEST.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DEFINE ZONE_CODE = WR

@@../zone_common/schema.sql