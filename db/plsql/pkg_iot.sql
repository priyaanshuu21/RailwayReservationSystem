-- =============================================================================
-- RailNexus - Phase 7: pkg_iot
-- Sensor ingestion and alerting. Runs in the shared schema and every zone
-- schema; the API writes a reading against the zone that owns the coach so the
-- append-only log is co-located with the inventory it describes.
--
-- Threshold model: a value outside [min_value, max_value] is CRITICAL and raises
-- an alert; a value inside the outer 10% band of the allowed range is WARN.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_iot IS
  FUNCTION evaluate(p_value IN NUMBER, p_min IN NUMBER, p_max NUMBER) RETURN VARCHAR2;

  PROCEDURE ingest_reading(
    p_sensor_id  IN  NUMBER,
    p_value      IN  NUMBER,
    o_reading_id OUT NUMBER,
    o_status     OUT VARCHAR2,
    o_alert_id   OUT NUMBER
  );

  FUNCTION latest_value(p_sensor_id IN NUMBER) RETURN NUMBER;

  PROCEDURE list_open_alerts(
    p_limit  IN  NUMBER,
    o_alerts OUT SYS_REFCURSOR
  );

  PROCEDURE acknowledge_alert(
    p_alert_id IN  NUMBER,
    p_actor    IN  VARCHAR2,
    o_message  OUT VARCHAR2
  );
END pkg_iot;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_iot IS
  FUNCTION evaluate(p_value NUMBER, p_min NUMBER, p_max NUMBER) RETURN VARCHAR2 IS
    v_band NUMBER;
  BEGIN
    IF p_value < p_min OR p_value > p_max THEN
      RETURN 'CRITICAL';
    END IF;
    v_band := (p_max - p_min) * 0.10;
    IF p_value <= p_min + v_band OR p_value >= p_max - v_band THEN
      RETURN 'WARN';
    END IF;
    RETURN 'OK';
  END evaluate;

  PROCEDURE ingest_reading(
    p_sensor_id IN NUMBER,
    p_value     IN NUMBER,
    o_reading_id OUT NUMBER,
    o_status     OUT VARCHAR2,
    o_alert_id   OUT NUMBER
  ) IS
    v_min   NUMBER(10,2);
    v_max   NUMBER(10,2);
    v_kind  VARCHAR2(12);
    v_coach NUMBER(12);
    v_msg   VARCHAR2(300);
  BEGIN
    SELECT min_value, max_value, sensor_kind, coach_id
      INTO v_min, v_max, v_kind, v_coach
      FROM iot_sensor
     WHERE sensor_id = p_sensor_id AND active = 'Y';

    o_status := evaluate(p_value, v_min, v_max);

    INSERT INTO sensor_reading (sensor_id, reading_time, value, status)
    VALUES (p_sensor_id, SYSTIMESTAMP, p_value, o_status)
    RETURNING reading_id INTO o_reading_id;

    IF o_status = 'CRITICAL' THEN
      v_msg := v_kind || ' sensor ' || p_sensor_id || ' on coach ' || v_coach ||
               ' out of band: ' || p_value || ' (allowed ' || v_min || '..' || v_max || ')';
      INSERT INTO sensor_alert (sensor_id, reading_id, severity, status, message)
      VALUES (p_sensor_id, o_reading_id, 'HIGH', 'OPEN', v_msg)
      RETURNING alert_id INTO o_alert_id;
    END IF;

    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20080, 'no active sensor ' || p_sensor_id);
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END ingest_reading;

  FUNCTION latest_value(p_sensor_id NUMBER) RETURN NUMBER IS
    v_value NUMBER(12,3);
  BEGIN
    SELECT value INTO v_value
      FROM (SELECT value FROM sensor_reading
             WHERE sensor_id = p_sensor_id
             ORDER BY reading_time DESC)
     WHERE ROWNUM = 1;
    RETURN v_value;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN RETURN NULL;
  END latest_value;

  PROCEDURE list_open_alerts(
    p_limit  IN  NUMBER,
    o_alerts OUT SYS_REFCURSOR
  ) IS
  BEGIN
    OPEN o_alerts FOR
      SELECT alert_id, sensor_id, sensor_kind, coach_id, severity, status, message, raised_at
        FROM (SELECT a.alert_id, a.sensor_id, s.sensor_kind, s.coach_id,
                     a.severity, a.status, a.message, a.raised_at
                FROM sensor_alert a JOIN iot_sensor s ON s.sensor_id = a.sensor_id
               WHERE a.status = 'OPEN'
               ORDER BY a.raised_at DESC)
       WHERE ROWNUM <= NVL(p_limit, 100);
  END list_open_alerts;

  PROCEDURE acknowledge_alert(
    p_alert_id IN  NUMBER,
    p_actor    IN  VARCHAR2,
    o_message  OUT VARCHAR2
  ) IS
  BEGIN
    UPDATE sensor_alert
       SET status = 'ACK', acknowledged_by = p_actor, acknowledged_at = SYSTIMESTAMP
     WHERE alert_id = p_alert_id AND status = 'OPEN';
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20081, 'alert ' || p_alert_id || ' is not open');
    END IF;
    o_message := 'alert ' || p_alert_id || ' acknowledged by ' || p_actor;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END acknowledge_alert;
END pkg_iot;
/
SHOW ERRORS
