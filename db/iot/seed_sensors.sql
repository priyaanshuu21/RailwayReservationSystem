-- =============================================================================
-- RailNexus - Phase 7: seed the IoT sensor catalogue (run per zone).
-- Creates one sensor of each kind on every coach in the current schema, with
-- kind-appropriate bands. Re-runnable: existing (coach, sensor_code) rows are
-- skipped. Safe to run against RAILNEXUS and each RAILNEXUS_<ZONE> schema.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DECLARE
  TYPE kind_row IS RECORD (
    kind      VARCHAR2(12),
    unit      VARCHAR2(10),
    min_value NUMBER(10,2),
    max_value NUMBER(10,2)
  );
  TYPE kind_tab IS TABLE OF kind_row;
  v_kinds kind_tab;
  v_exists NUMBER;
  v_count  NUMBER := 0;
BEGIN
  v_kinds := kind_tab(
    kind_row('TEMP',  'C',    15, 45),
    kind_row('SMOKE', 'PPM',   0, 100),
    kind_row('DOOR',  'STATE', 0, 1),
    kind_row('AQI',   'AQI',   0, 300)
  );

  FOR c IN (SELECT coach_id FROM coach ORDER BY coach_id) LOOP
    FOR k IN 1 .. v_kinds.COUNT LOOP
      SELECT COUNT(*) INTO v_exists
        FROM iot_sensor
       WHERE coach_id = c.coach_id
         AND sensor_code = v_kinds(k).kind || '-' || c.coach_id;

      IF v_exists = 0 THEN
        INSERT INTO iot_sensor
          (coach_id, sensor_code, sensor_kind, unit, min_value, max_value)
        VALUES
          (c.coach_id,
           v_kinds(k).kind || '-' || c.coach_id,
           v_kinds(k).kind,
           v_kinds(k).unit,
           v_kinds(k).min_value,
           v_kinds(k).max_value);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('iot sensors created: ' || v_count);
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
SHOW ERRORS
