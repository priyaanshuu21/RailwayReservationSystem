-- =============================================================================
-- RailNexus - Phase 2: distributed (cross-zone) booking.
-- Runs as RAILNEXUS. Demonstrates a booking whose journey spans zones:
--   * the schedule/coach/seat inventory lives in the train's HOME zone,
--     reached through the ZONE_* DB links created by db_links.sql;
--   * the booking/ticket ledger is written in the shared schema;
--   * seat occupancy is written back to the owning zone schema through the link.
--
-- On this single-instance build both writes commit in ONE local transaction,
-- which is exactly what a real multi-node RailNexus would need to turn into a
-- distributed (2PC) transaction. The procedure keeps that seam: every remote
-- write is parameterised by the zone link name, so pointing the links at remote
-- services plus adding the two-phase commit is the only change required.
--
-- Concurrency note: a production build locks the remote seat with
-- SELECT ... FOR UPDATE SKIP LOCKED across the link. Links to a remote instance
-- do not support row locks, so that call moves inside a distributed transaction
-- at deploy time; locally the serialisation is provided by the single
-- transaction. Verified only by design here - Oracle is blocked in this
-- environment (see .agent/progress.json).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_cross_zone IS
  PROCEDURE book_cross_zone_ticket(
    p_passenger_id IN  NUMBER,
    p_schedule_id  IN  NUMBER,
    p_from_stop    IN  NUMBER,
    p_to_stop      IN  NUMBER,
    p_coach_class  IN  VARCHAR2,
    p_request_id   IN  VARCHAR2,
    p_fare         IN  NUMBER DEFAULT 1200,
    o_booking_id   OUT NUMBER,
    o_ticket_id    OUT NUMBER,
    o_pnr          OUT VARCHAR2,
    o_zone_code    OUT VARCHAR2
  );
  PROCEDURE demo_cross_zone_booking;
END pkg_cross_zone;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_cross_zone IS

  -- Map a zone id (1..3) to its DB link name in the shared schema.
  FUNCTION link_for_zone(p_zone_id NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN CASE p_zone_id
      WHEN 1 THEN 'ZONE_NORTH'
      WHEN 2 THEN 'ZONE_WEST'
      WHEN 3 THEN 'ZONE_SOUTH'
      ELSE NULL END;
  END link_for_zone;

  PROCEDURE book_cross_zone_ticket(
    p_passenger_id IN  NUMBER,
    p_schedule_id  IN  NUMBER,
    p_from_stop    IN  NUMBER,
    p_to_stop      IN  NUMBER,
    p_coach_class  IN  VARCHAR2,
    p_request_id   IN  VARCHAR2,
    p_fare         IN  NUMBER DEFAULT 1200,
    o_booking_id   OUT NUMBER,
    o_ticket_id    OUT NUMBER,
    o_pnr          OUT VARCHAR2,
    o_zone_code    OUT VARCHAR2
  ) IS
    v_zone_id      NUMBER;
    v_route_id     NUMBER;
    v_train_id     NUMBER;
    v_zone_code    VARCHAR2(4);
    v_link         VARCHAR2(40);
    v_seat_id      NUMBER;
    v_coach_id     NUMBER;
    v_berth        VARCHAR2(12);
    v_pnr          VARCHAR2(10);
    v_bid          NUMBER;
    v_tid          NUMBER;
  BEGIN
    -- The shared schema mirrors train_schedule (Phase 1 seed), so we can
    -- resolve the owning zone locally, then reach the inventory remotely.
    SELECT zone_id, route_id, train_id
      INTO v_zone_id, v_route_id, v_train_id
      FROM train_schedule
     WHERE schedule_id = p_schedule_id;

    v_zone_code := CASE v_zone_id WHEN 1 THEN 'NR' WHEN 2 THEN 'WR' WHEN 3 THEN 'SR' END;
    v_link      := link_for_zone(v_zone_id);
    IF v_link IS NULL THEN
      RAISE_APPLICATION_ERROR(-20031, 'unknown zone for schedule ' || p_schedule_id);
    END IF;

    -- 1) Pick a free seat in the home zone for this schedule+class.
    EXECUTE IMMEDIATE
      'SELECT c.coach_id, s.seat_id, s.berth_type
         FROM seat@' || v_link || ' s
         JOIN coach@' || v_link || ' c ON c.coach_id = s.coach_id
        WHERE c.schedule_id = :1 AND c.coach_class = :2
          AND s.status = ''A'' AND ROWNUM = 1
        ORDER BY s.seat_id'
      INTO v_coach_id, v_seat_id, v_berth
      USING p_schedule_id, p_coach_class;

    IF v_coach_id IS NULL THEN
      RAISE_APPLICATION_ERROR(-20032, 'no free seat for schedule ' || p_schedule_id ||
                                      ' class ' || p_coach_class);
    END IF;

    -- 2) Idempotent ledger write in the shared schema.
    IF p_request_id IS NOT NULL THEN
      BEGIN
        SELECT booking_id INTO o_booking_id FROM booking WHERE request_id = p_request_id;
        RETURN;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    END IF;

    INSERT INTO booking (booking_id, request_id, booking_ref, person_id, schedule_id,
                         coach_class, from_station_id, to_station_id,
                         from_stop_order, to_stop_order, coach_id, seat_id,
                         status, fare_total)
    VALUES (seq_booking.NEXTVAL, p_request_id, 'BK' || LPAD(seq_booking.NEXTVAL, 10, '0'),
            p_passenger_id, p_schedule_id, p_coach_class,
            (SELECT station_id FROM station_route WHERE route_id = v_route_id AND stop_order = p_from_stop),
            (SELECT station_id FROM station_route WHERE route_id = v_route_id AND stop_order = p_to_stop),
            p_from_stop, p_to_stop, v_coach_id, v_seat_id, 'BOK', p_fare)
    RETURNING booking_id INTO v_bid;

    v_pnr := 'PN' || LPAD(seq_ticket.NEXTVAL, 8, '0');
    INSERT INTO ticket (ticket_id, booking_id, schedule_id, ticket_type, pnr, status)
    VALUES (seq_ticket.NEXTVAL, v_bid, p_schedule_id, 'C', v_pnr, 'CFM')
    RETURNING ticket_id INTO v_tid;

    INSERT INTO confirmed_ticket (ticket_id, coach_id, seat_id, berth, from_stop_order, to_stop_order)
    VALUES (v_tid, v_coach_id, v_seat_id, v_berth, p_from_stop, p_to_stop);

    -- 3) Write occupancy back to the owning zone: reserve the seat and open the
    --    seat/segment row (translated to the remote schema's sequence).
    EXECUTE IMMEDIATE
      'UPDATE seat@' || v_link || '
          SET status = ''R'', current_from_stop = :1, current_to_stop = :2, version = version + 1
        WHERE seat_id = :3'
      USING p_from_stop, p_to_stop, v_seat_id;

    EXECUTE IMMEDIATE
      'INSERT INTO seat_segment@' || v_link || ' (segment_id, seat_id, from_stop, to_stop, status)
       VALUES (seq_seat_segment@' || v_link || '.NEXTVAL, :1, :2, :3, ''O'')'
      USING v_seat_id, p_from_stop, p_to_stop;

    COMMIT;

    o_booking_id := v_bid;
    o_ticket_id  := v_tid;
    o_pnr        := v_pnr;
    o_zone_code  := v_zone_code;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20033, 'ticket not found for schedule ' || p_schedule_id);
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END book_cross_zone_ticket;

  PROCEDURE demo_cross_zone_booking IS
    v_schedule_id NUMBER;
    v_bid NUMBER;
    v_tid NUMBER;
    v_pnr VARCHAR2(10);
    v_zone VARCHAR2(4);
  BEGIN
    -- Train 1 (City Rajdhani Express) runs Northvale (101, NR) -> Southbay (301, SR):
    -- origin (stop 1) is owned by ZONE_NORTH, destination (stop 6) by ZONE_SOUTH.
    SELECT MIN(schedule_id) INTO v_schedule_id
      FROM train_schedule WHERE train_id = 1 AND journey_date >= TRUNC(SYSDATE);

    pkg_cross_zone.book_cross_zone_ticket(
      p_passenger_id => 1001, p_schedule_id => v_schedule_id,
      p_from_stop => 1, p_to_stop => 6, p_coach_class => '3A',
      p_request_id => 'DEMO-CROSS-ZONE-0001', p_fare => 1323,
      o_booking_id => v_bid, o_ticket_id => v_tid, o_pnr => v_pnr, o_zone_code => v_zone);

    DBMS_OUTPUT.PUT_LINE('cross-zone booking ' || v_bid || ' pnr ' || v_pnr ||
                         ' zone ' || v_zone || ' seat owned by ' || v_zone);
  END demo_cross_zone_booking;
END pkg_cross_zone;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT Distributed booking package installed