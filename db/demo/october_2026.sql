-- Additive, repeatable demo inventory. Never removes bookings.
-- DEFINE DEMO_ZONE_ID = 0 (catalogue) or 1/2/3 (owning zone).
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
DECLARE
  v_sid NUMBER;
  v_count NUMBER;
  v_bid NUMBER; v_tid NUMBER; v_pnr VARCHAR2(10); v_status VARCHAR2(4); v_pay NUMBER; v_fare NUMBER;
  v_class VARCHAR2(3); v_to NUMBER;
BEGIN
  FOR t IN (SELECT t.train_id,t.train_type,tr.route_id,st.zone_id FROM train t
    JOIN train_route tr ON tr.train_id=t.train_id AND tr.is_active=1
    JOIN route r ON r.route_id=tr.route_id JOIN station st ON st.station_id=r.origin_station
    WHERE t.active=1 AND t.train_type<>'F' AND (&DEMO_ZONE_ID=0 OR st.zone_id=&DEMO_ZONE_ID)) LOOP
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
          IF v_count=0 THEN seed_schedule_coaches(v_sid,cls.code,1,16,2); END IF;
        END LOOP;
        -- A small, clearly labelled 1A compartment demonstrates WL -> confirmed.
        IF t.train_id=1 AND d IN (19,28) THEN
          SELECT COUNT(*) INTO v_count FROM booking WHERE schedule_id=v_sid AND coach_class='1A';
          IF v_count=0 THEN
            DELETE FROM seat_segment WHERE seat_id IN (SELECT s.seat_id FROM seat s JOIN coach c ON c.coach_id=s.coach_id
              WHERE c.schedule_id=v_sid AND c.coach_class='1A') AND seat_id NOT IN
              (SELECT seat_id FROM (SELECT s.seat_id FROM seat s JOIN coach c ON c.coach_id=s.coach_id
                WHERE c.schedule_id=v_sid AND c.coach_class='1A' ORDER BY s.seat_id) WHERE ROWNUM<=2);
            DELETE FROM seat WHERE coach_id IN (SELECT coach_id FROM coach WHERE schedule_id=v_sid AND coach_class='1A')
              AND seat_id NOT IN (SELECT seat_id FROM (SELECT s.seat_id FROM seat s JOIN coach c ON c.coach_id=s.coach_id
                WHERE c.schedule_id=v_sid AND c.coach_class='1A' ORDER BY s.seat_id) WHERE ROWNUM<=2);
            UPDATE coach SET coach_capacity=2,class_quota=2 WHERE schedule_id=v_sid AND coach_class='1A';
            UPDATE schedule_class_policy SET rac_capacity=0 WHERE schedule_id=v_sid AND coach_class='1A';
          END IF;
        END IF;
        v_class:=CASE WHEN t.train_type='P' THEN '2S' ELSE 'SL' END;
        SELECT MAX(stop_order) INTO v_to FROM station_route WHERE route_id=t.route_id;
        FOR n IN 1..3 LOOP
          SELECT COUNT(*) INTO v_count FROM booking WHERE request_id='OCT26-'||t.train_id||'-'||d||'-'||n;
          IF v_count=0 THEN
            pkg_booking.book_ticket(1003+n,v_sid,1,v_to,v_class,
              'OCT26-'||t.train_id||'-'||d||'-'||n,NULL,v_bid,v_tid,v_pnr,v_status);
            SELECT fare_total INTO v_fare FROM booking WHERE booking_id=v_bid;
            pkg_payment.record_payment(v_bid,'U',v_fare,'OCT26-GW-'||v_bid,'OCT26-PAY-'||v_bid,'demo@upi',NULL,NULL,NULL,NULL,v_pay);
            pkg_payment.capture_payment(v_pay);
            UPDATE payment SET processed_at=DATE '2026-10-01'+d+12/24 WHERE payment_id=v_pay;
            COMMIT;
          END IF;
        END LOOP;
        IF t.train_id=1 AND d=19 THEN
          FOR n IN 1..3 LOOP
            SELECT COUNT(*) INTO v_count FROM booking WHERE request_id='OCT26-WL-'||n;
            IF v_count=0 THEN
              pkg_booking.book_ticket(CASE WHEN n=2 THEN 1002 ELSE 1001 END,v_sid,1,6,'1A',
                'OCT26-WL-'||n,NULL,v_bid,v_tid,v_pnr,v_status);
              IF n<=2 THEN
                SELECT fare_total INTO v_fare FROM booking WHERE booking_id=v_bid;
                pkg_payment.record_payment(v_bid,'U',v_fare,'OCT26-DEMO-'||v_bid,'OCT26-DEMO-'||v_bid,'demo@upi',NULL,NULL,NULL,NULL,v_pay);
                pkg_payment.capture_payment(v_pay);
              END IF;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  COMMIT;
END;
/
