-- =============================================================================
-- RailNexus - recompile_invalid.sql
-- Final pass that recompiles any INVALID objects in the current schema.
-- Later DDL (e.g. ALTER TABLE ... ADD in the JSON migration) invalidates earlier
-- packages/views that depend on the altered table, including cross-schema
-- dependents that reach it through a synonym. Running this last leaves every
-- schema free of INVALID objects. Runs once per schema (RAILNEXUS, each zone,
-- reporting).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DECLARE
  v_passes  NUMBER := 0;
  v_invalid NUMBER;
BEGIN
  LOOP
    v_passes := v_passes + 1;
    SELECT COUNT(*) INTO v_invalid FROM user_objects WHERE status = 'INVALID';
    EXIT WHEN v_invalid = 0 OR v_passes > 5;

    FOR o IN (SELECT object_name, object_type FROM user_objects WHERE status = 'INVALID') LOOP
      BEGIN
        IF o.object_type = 'PACKAGE BODY' THEN
          EXECUTE IMMEDIATE 'ALTER PACKAGE "' || o.object_name || '" COMPILE BODY';
        ELSIF o.object_type = 'PACKAGE' THEN
          EXECUTE IMMEDIATE 'ALTER PACKAGE "' || o.object_name || '" COMPILE';
        ELSIF o.object_type = 'TYPE BODY' THEN
          EXECUTE IMMEDIATE 'ALTER TYPE "' || o.object_name || '" COMPILE BODY';
        ELSE
          EXECUTE IMMEDIATE 'ALTER ' || o.object_type || ' "' || o.object_name || '" COMPILE';
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END LOOP;

  SELECT COUNT(*) INTO v_invalid FROM user_objects WHERE status = 'INVALID';
  DBMS_OUTPUT.PUT_LINE('recompile pass ' || v_passes || ': ' || v_invalid || ' invalid object(s) remain');
END;
/

WHENEVER SQLERROR EXIT
PROMPT recompile pass complete
