-- =============================================================================
-- RailNexus - zone_seed.sql (zone_common)
-- Reproduces the schedules, coaches and seats for every train that originates
-- in THIS zone (DEFINE ZONE_CODE). The identical generator (seed_helper.sql)
-- keeps every zone's inventory structurally equal; only the rows differ, which
-- is the correct shape for horizontal fragmentation.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

@@seed_helper.sql

DECLARE
  v_zone_id NUMBER;
  CURSOR c_trains IS
    SELECT t.train_id, t.train_type, tr.route_id, st.zone_id
      FROM train t
      JOIN train_route tr ON tr.train_id = t.train_id AND tr.is_active = 1
      JOIN route r ON r.route_id = tr.route_id
      JOIN station st ON st.station_id = r.origin_station
     WHERE t.active = 1 AND st.zone_id = v_zone_id;
  v_schedule_id NUMBER(12);
BEGIN
  SELECT zone_id INTO v_zone_id FROM zone WHERE zone_code = '&ZONE_CODE';

  DELETE FROM seat_segment;
  DELETE FROM seat;
  DELETE FROM coach;
  DELETE FROM schedule_class_policy;
  DELETE FROM train_schedule;

  FOR rec IN c_trains LOOP
    FOR d IN 0 .. 20 LOOP
      INSERT INTO train_schedule (schedule_id, train_id, route_id, zone_id, journey_date, departure_time, arrival_time)
      VALUES (seq_schedule.NEXTVAL, rec.train_id, rec.route_id, rec.zone_id,
              TRUNC(SYSDATE) + d,
              TRUNC(SYSDATE) + d + 18/24 + MOD(rec.train_id, 3)/24,
              TRUNC(SYSDATE) + d + 27/24 + MOD(rec.train_id, 2)/24)
      RETURNING schedule_id INTO v_schedule_id;

      IF rec.train_type IN ('E','S','P') THEN
        IF rec.train_type = 'P' THEN
          seed_schedule_coaches(v_schedule_id, '2S', 1, 2, 1);
        ELSE
          seed_schedule_coaches(v_schedule_id, 'SL', 1, 2, 1);
          seed_schedule_coaches(v_schedule_id, '3A', 1, 2, 1);
          seed_schedule_coaches(v_schedule_id, '2A', 1, 2, 1);
          seed_schedule_coaches(v_schedule_id, '1A', 1, 2, 1);
        END IF;
      END IF;
    END LOOP;
    DBMS_OUTPUT.PUT_LINE(rec.train_id || ' seeded in zone ' || v_zone_id);
  END LOOP;
  COMMIT;
END;
/

WHENEVER SQLERROR EXIT
PROMPT Zone seed loaded