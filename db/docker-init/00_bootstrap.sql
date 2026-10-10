-- =============================================================================
-- RailNexus docker-init master bootstrap.
-- The Oracle Free container runs this file on first start (empty volume).
-- It chains every RailNexus schema + seed script in dependency order using
-- absolute paths inside /opt/railnexus (mounted from ./db in docker-compose).
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

PROMPT >>> bootstrap schemas
@/opt/railnexus/shared_ddl/00_bootstrap.sql

PROMPT >>> shared schema + seed
CONNECT RAILNEXUS/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/shared_ddl/01_core_schema.sql
@/opt/railnexus/shared_ddl/02_seed_data.sql

PROMPT >>> zone schemas + seeds
CONNECT RAILNEXUS_NORTH/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/zone_north/schema.sql

CONNECT RAILNEXUS_WEST/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/zone_west/schema.sql

CONNECT RAILNEXUS_SOUTH/railnexus_dev@//localhost:1521/FREEPDB1
@/opt/railnexus/zone_south/schema.sql

PROMPT RailNexus docker bootstrap complete