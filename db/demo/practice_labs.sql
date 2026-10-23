-- Dedicated practice trains. Existing normal journeys and bookings are untouched.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE n NUMBER; sid NUMBER; rac NUMBER;
BEGIN
  FOR lab IN 1..2 LOOP
    sid:=20901000+lab;
    rac:=CASE WHEN lab=1 THEN 0 ELSE 1 END;
    SELECT COUNT(*) INTO n FROM train_schedule WHERE train_id=9000+lab AND journey_date=DATE '2026-10-28';
    IF n=0 THEN
      INSERT INTO train_schedule(schedule_id,train_id,route_id,zone_id,journey_date,departure_time,arrival_time)
      VALUES(sid,9000+lab,10,1,DATE '2026-10-28',TIMESTAMP '2026-10-28 09:00:00',TIMESTAMP '2026-10-28 19:00:00');
    END IF;
    IF &DEMO_ZONE_ID=1 THEN
      SELECT COUNT(*) INTO n FROM coach WHERE schedule_id=sid;
      IF n=0 THEN seed_schedule_coaches(sid,'1A',1,2,rac); END IF;
      UPDATE schedule_class_policy SET rac_capacity=rac,waitlist_limit=10 WHERE schedule_id=sid AND coach_class='1A';
    END IF;
  END LOOP;
  COMMIT;
END;
/
