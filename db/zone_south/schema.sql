-- =============================================================================
-- RailNexus - ZONE_SOUTH schema + seed.
-- Applies the shared zone-common DDL and seeds inventory for trains originating
-- in the Southern Railway zone. Runs as RAILNEXUS_SOUTH.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DEFINE ZONE_CODE = SR

@@../zone_common/schema.sql