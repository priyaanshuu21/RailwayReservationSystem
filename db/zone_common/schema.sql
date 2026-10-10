-- =============================================================================
-- RailNexus - zone_common/schema.sql
-- Included by each zone schema (RAILNEXUS_NORTH/WEST/SOUTH).
--   1. synonyms to shared reference data
--   2. the identical booking family DDL (horizontal fragmentation)
--   3. zone-local seed reproduced with the same deterministic generator
-- Requires DEFINE ZONE_CODE (e.g. 'NR') set by the calling zone script.
-- =============================================================================

@@zone_synonyms.sql
@@booking_family.sql
@@zone_seed.sql