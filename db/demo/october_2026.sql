-- Additive, repeatable demo inventory. Never removes bookings.
-- DEFINE DEMO_ZONE_ID = 0 (catalogue) or 1/2/3 (owning zone).
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
DECLARE
  v_sid NUMBER;
  v_count NUMBER;
BEGIN
  FOR t IN (SELECT t.train_id,t.train_type,tr.route_id,st.zone_id FROM train t
    JOIN train_route tr ON tr.train_id=t.train_id AND tr.is_active=1
    JOIN route r ON r.route_id=tr.route_id JOIN station st ON st.station_id=r.origin_station
    WHERE t.active=1 AND t.train_type<>'F' AND t.train_id NOT IN (9001,9002) AND (&DEMO_ZONE_ID=0 OR st.zone_id=&DEMO_ZONE_ID)) LOOP
    FOR d IN 0..29 LOOP
      BEGIN
        SELECT schedule_id INTO v_sid FROM train_schedule WHERE train_id=t.train_id AND journey_date=DATE '2026-10-01'+d;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        v_sid:=2026100000+t.train_id*100+d+1;
        INSERT INTO train_schedule(schedule_id,train_id,route_id,zone_id,journey_date,departure_time,arrival_time)
        VALUES(v_sid,t.train_id,t.route_id,t.zone_id,DATE '2026-10-01'+d,
          DATE '2026-10-01'+d+18/24,DATE '2026-10-02'+d+6/24);
      END;
      IF &DEMO_ZONE_ID<>0 THEN
        FOR cls IN (SELECT 'SL' code FROM dual WHERE t.train_type<>'P' UNION ALL
                    SELECT '3A' FROM dual WHERE t.train_type<>'P' UNION ALL
                    SELECT '2A' FROM dual WHERE t.train_type<>'P' UNION ALL
                    SELECT '1A' FROM dual WHERE t.train_type<>'P' UNION ALL
                    SELECT '2S' FROM dual WHERE t.train_type='P') LOOP
          SELECT COUNT(*) INTO v_count FROM coach WHERE schedule_id=v_sid AND coach_class=cls.code;
          IF v_count=0 THEN seed_schedule_coaches(v_sid,cls.code,1,2,1); END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  COMMIT;
END;
/
