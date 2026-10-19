-- =============================================================================
-- RailNexus - Phase 3: pkg_booking (availability, book, cancel + RAC/waitlist).
-- Deployed identically in the shared schema and every zone schema (ZONEALL).
-- Operates on the schema-LOCAL booking family. A schedule that belongs to a
-- different zone raises ORA using the pkg_cross_zone entry point (Phase 2).
--
-- Booking flow
--   1. optimistic-compute fare with pkg_fare unless the caller passes one.
--   2. lock a free seat with SELECT ... FOR UPDATE SKIP LOCKED, then write
--      booking + CONFIRMED ticket + seat reservation + occupancy segment.
--   3. no free seat and RAC capacity left  -> RAC ticket over a shared seat.
--   4. otherwise waitlist depth left        -> WAITLIST ticket (FIFO per class).
--   5. otherwise RAISE 'no availability'.
-- Cancel frees the seat/segment and promotes the first RAC in the class to
-- CONFIRMED so the FIFO guarantee holds in one transaction.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_booking IS
  PROCEDURE availability(
    p_schedule_id    IN  NUMBER,
    p_coach_class    IN  VARCHAR2,
    o_free_seats     OUT NUMBER,
    o_rac_remaining  OUT NUMBER,
    o_wl_remaining   OUT NUMBER
  );

  PROCEDURE book_ticket(
    p_passenger_id  IN  NUMBER,
    p_schedule_id   IN  NUMBER,
    p_from_stop     IN  NUMBER,
    p_to_stop       IN  NUMBER,
    p_coach_class   IN  VARCHAR2,
    p_request_id    IN  VARCHAR2,
    p_fare          IN  NUMBER DEFAULT NULL,
    o_booking_id    OUT NUMBER,
    o_ticket_id     OUT NUMBER,
    o_pnr           OUT VARCHAR2,
    o_ticket_status OUT VARCHAR2,
    p_berth_preference IN VARCHAR2 DEFAULT NULL
  );

  PROCEDURE cancel_ticket(
    p_booking_id     IN  NUMBER,
    o_refund_amount  OUT NUMBER
  );
END pkg_booking;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_booking IS

  PROCEDURE availability(
    p_schedule_id    IN  NUMBER,
    p_coach_class    IN  VARCHAR2,
    o_free_seats     OUT NUMBER,
    o_rac_remaining  OUT NUMBER,
    o_wl_remaining   OUT NUMBER
  ) IS
    v_rac_capacity NUMBER(4);
    v_wl_limit     NUMBER(4);
    v_rac_used     NUMBER := 0;
    v_wl_used      NUMBER := 0;
  BEGIN
    SELECT COUNT(*) INTO o_free_seats
      FROM seat s JOIN coach c ON c.coach_id = s.coach_id
     WHERE c.schedule_id = p_schedule_id
       AND c.coach_class = p_coach_class
       AND s.status = 'A';

    BEGIN
      SELECT rac_capacity, waitlist_limit INTO v_rac_capacity, v_wl_limit
        FROM schedule_class_policy
       WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      v_rac_capacity := 0; v_wl_limit := 0;
    END;

    SELECT COUNT(*) INTO v_rac_used FROM waitlist_queue
     WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class AND queue_type = 'RAC';
    SELECT COUNT(*) INTO v_wl_used FROM waitlist_queue
     WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class AND queue_type = 'WL';

    o_rac_remaining := GREATEST(v_rac_capacity - v_rac_used, 0);
    o_wl_remaining  := GREATEST(v_wl_limit - v_wl_used, 0);
  END availability;

  PROCEDURE book_ticket(
    p_passenger_id  IN  NUMBER,
    p_schedule_id   IN  NUMBER,
    p_from_stop     IN  NUMBER,
    p_to_stop       IN  NUMBER,
    p_coach_class   IN  VARCHAR2,
    p_request_id    IN  VARCHAR2,
    p_fare          IN  NUMBER DEFAULT NULL,
    o_booking_id    OUT NUMBER,
    o_ticket_id     OUT NUMBER,
    o_pnr           OUT VARCHAR2,
    o_ticket_status OUT VARCHAR2,
    p_berth_preference IN VARCHAR2 DEFAULT NULL
  ) IS
    v_zone_id      NUMBER;
    v_route_id     NUMBER;
    v_train_id     NUMBER;
    v_journey_date DATE;
    v_distance     NUMBER;
    v_total_fare   NUMBER(12,2);
    v_coach_id     NUMBER(12);
    v_seat_id      NUMBER(14);
    v_berth        VARCHAR2(12);
    v_rac_seat     NUMBER(14);
    v_rac_capacity NUMBER(4);
    v_wl_limit     NUMBER(4);
    v_rac_used     NUMBER := 0;
    v_wl_used      NUMBER := 0;
    v_position     NUMBER;
    v_bid          NUMBER(12);
    v_tid          NUMBER(14);
    v_pnr          VARCHAR2(10);
    v_ticket_status VARCHAR2(4);
    v_from_station NUMBER(10);
    v_to_station   NUMBER(10);
    v_lines        pkg_fare.fare_lines;
  BEGIN
    -- This zone must own the schedule.
    SELECT zone_id, route_id, train_id, journey_date
      INTO v_zone_id, v_route_id, v_train_id, v_journey_date
      FROM train_schedule WHERE schedule_id = p_schedule_id AND status = 'ACTIVE' FOR UPDATE;


    -- Idempotency: an earlier attempt with the same request id is a no-op that
    -- replays the previously issued keys.
    IF p_request_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_position FROM booking b WHERE b.request_id=p_request_id
        AND (b.person_id<>p_passenger_id OR b.schedule_id<>p_schedule_id OR b.coach_class<>p_coach_class
             OR b.from_stop_order<>p_from_stop OR b.to_stop_order<>p_to_stop);
      IF v_position>0 THEN RAISE_APPLICATION_ERROR(-20056,'Request key belongs to a different reservation'); END IF;
      BEGIN
        SELECT b.booking_id, t.ticket_id, t.pnr, t.status
          INTO v_bid, v_tid, v_pnr, v_ticket_status
          FROM booking b JOIN ticket t ON t.booking_id = b.booking_id
         WHERE b.request_id = p_request_id;
        o_booking_id    := v_bid;
        o_ticket_id     := v_tid;
        o_pnr           := v_pnr;
        o_ticket_status := v_ticket_status;
        RETURN;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    END IF;

    pkg_rules.enforce_booking_rules(p_passenger_id, v_train_id, v_journey_date);
    IF p_to_stop <= p_from_stop THEN
      RAISE_APPLICATION_ERROR(-20053, 'Destination must follow the boarding stop');
    END IF;
    SELECT COUNT(*) INTO v_position FROM passenger WHERE person_id = p_passenger_id;
    IF v_position = 0 THEN RAISE_APPLICATION_ERROR(-20054, 'Only passengers can reserve tickets'); END IF;
    SELECT COUNT(*) INTO v_position FROM schedule_class_policy
      WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class;
    IF v_position = 0 THEN RAISE_APPLICATION_ERROR(-20055, 'This coach class is not offered on this train'); END IF;

    -- Fare (unless supplied) from distance between the boarding stops.
    IF p_fare IS NULL OR p_fare = 0 THEN
      SELECT ABS(a.km_from_origin - b.km_from_origin) INTO v_distance
        FROM station_route a, station_route b
       WHERE a.route_id = v_route_id AND a.stop_order = p_from_stop
         AND b.route_id = v_route_id AND b.stop_order = p_to_stop;
      v_total_fare := pkg_fare.compute_fare(v_train_id, p_coach_class, v_distance, v_journey_date);
    ELSE
      v_total_fare := p_fare;
    END IF;

    SELECT station_id INTO v_from_station FROM station_route
     WHERE route_id = v_route_id AND stop_order = p_from_stop;
    SELECT station_id INTO v_to_station FROM station_route
     WHERE route_id = v_route_id AND stop_order = p_to_stop;

    -- Step 1: try to lock a genuinely free seat (one transaction, serialised).
    FOR candidate IN (
      SELECT s.seat_id, s.coach_id, s.berth_type FROM seat s
      JOIN coach c ON c.coach_id = s.coach_id
      WHERE c.schedule_id = p_schedule_id AND c.coach_class = p_coach_class AND s.status = 'A'
      ORDER BY CASE WHEN s.berth_type = p_berth_preference THEN 0 ELSE 1 END, s.seat_id
      FOR UPDATE OF s.status SKIP LOCKED
    ) LOOP
      v_seat_id := candidate.seat_id;
      v_coach_id := candidate.coach_id;
      v_berth := candidate.berth_type;
      EXIT;
    END LOOP;

    IF v_coach_id IS NOT NULL THEN
      -- ---------- CONFIRMED ----------
      INSERT INTO booking (booking_id, request_id, booking_ref, person_id, schedule_id,
                           coach_class, from_station_id, to_station_id,
                           from_stop_order, to_stop_order, coach_id, seat_id, status, fare_total)
      VALUES (seq_booking.NEXTVAL, p_request_id,
              'BK' || LPAD(seq_booking.NEXTVAL, 10, '0'),
              p_passenger_id, p_schedule_id, p_coach_class,
              v_from_station, v_to_station, p_from_stop, p_to_stop,
              v_coach_id, v_seat_id, 'BOK', v_total_fare)
      RETURNING booking_id INTO v_bid;

      v_pnr := CASE v_zone_id WHEN 1 THEN 'NR' WHEN 2 THEN 'WR' ELSE 'SR' END || LPAD(seq_ticket.NEXTVAL, 8, '0');
      INSERT INTO ticket (ticket_id, booking_id, schedule_id, ticket_type, pnr, status)
      VALUES (seq_ticket.NEXTVAL, v_bid, p_schedule_id, 'C', v_pnr, 'CFM')
      RETURNING ticket_id INTO v_tid;

      INSERT INTO confirmed_ticket (ticket_id, coach_id, seat_id, berth, from_stop_order, to_stop_order)
      VALUES (v_tid, v_coach_id, v_seat_id, v_berth, p_from_stop, p_to_stop);

      UPDATE seat SET status = 'R', current_from_stop = p_from_stop,
                      current_to_stop = p_to_stop, version = version + 1
       WHERE seat_id = v_seat_id;

      DELETE FROM seat_segment WHERE seat_id = v_seat_id AND status = 'F';
      INSERT INTO seat_segment (segment_id, seat_id, from_stop, to_stop, status, booking_id)
      VALUES (seq_seat_segment.NEXTVAL, v_seat_id, p_from_stop, p_to_stop, 'O', v_bid);

      v_ticket_status := 'CFM';

    ELSE
      -- ---------- RAC / WAITLIST ----------
      SELECT rac_capacity, waitlist_limit INTO v_rac_capacity, v_wl_limit
        FROM schedule_class_policy
       WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class;
      SELECT COUNT(*) INTO v_rac_used FROM waitlist_queue
       WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class AND queue_type = 'RAC';
      SELECT COUNT(*) INTO v_wl_used FROM waitlist_queue
       WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class AND queue_type = 'WL';

      -- RAC shares one of the class' reserved seats with detach-at-boarding.
      IF v_rac_used < v_rac_capacity THEN
        SELECT MIN(seat_id) INTO v_rac_seat
          FROM seat s JOIN coach c ON c.coach_id = s.coach_id
         WHERE c.schedule_id = p_schedule_id AND c.coach_class = p_coach_class
           AND s.status = 'R';
        IF v_rac_seat IS NOT NULL THEN
          SELECT coach_id INTO v_coach_id FROM seat WHERE seat_id = v_rac_seat;
          INSERT INTO booking (booking_id, request_id, booking_ref, person_id, schedule_id,
                               coach_class, from_station_id, to_station_id,
                               from_stop_order, to_stop_order, coach_id, seat_id, status, fare_total)
          VALUES (seq_booking.NEXTVAL, p_request_id,
                  'BK' || LPAD(seq_booking.NEXTVAL, 10, '0'),
                  p_passenger_id, p_schedule_id, p_coach_class,
                  v_from_station, v_to_station, p_from_stop, p_to_stop,
                  v_coach_id, NULL, 'BOK', v_total_fare)
          RETURNING booking_id INTO v_bid;

          v_pnr := CASE v_zone_id WHEN 1 THEN 'NR' WHEN 2 THEN 'WR' ELSE 'SR' END || LPAD(seq_ticket.NEXTVAL, 8, '0');
          INSERT INTO ticket (ticket_id, booking_id, schedule_id, ticket_type, pnr, status)
          VALUES (seq_ticket.NEXTVAL, v_bid, p_schedule_id, 'R', v_pnr, 'RAC')
          RETURNING ticket_id INTO v_tid;

          INSERT INTO rac_ticket (ticket_id, coach_id, seat_id) VALUES (v_tid, v_coach_id, v_rac_seat);

          SELECT NVL(MAX(position),0) + 1 INTO v_position FROM waitlist_queue
           WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class;
          INSERT INTO waitlist_queue (queue_id, schedule_id, coach_class, ticket_id, position, queue_type)
          VALUES (seq_waitlist.NEXTVAL, p_schedule_id, p_coach_class, v_tid, v_position, 'RAC');

          v_ticket_status := 'RAC';
        END IF;
      END IF;

      IF v_ticket_status IS NULL AND v_wl_used < v_wl_limit THEN
        INSERT INTO booking (booking_id, request_id, booking_ref, person_id, schedule_id,
                             coach_class, from_station_id, to_station_id,
                             from_stop_order, to_stop_order, coach_id, seat_id, status, fare_total)
        VALUES (seq_booking.NEXTVAL, p_request_id,
                'BK' || LPAD(seq_booking.NEXTVAL, 10, '0'),
                p_passenger_id, p_schedule_id, p_coach_class,
                v_from_station, v_to_station, p_from_stop, p_to_stop,
                NULL, NULL, 'BOK', v_total_fare)
        RETURNING booking_id INTO v_bid;

        v_pnr := CASE v_zone_id WHEN 1 THEN 'NR' WHEN 2 THEN 'WR' ELSE 'SR' END || LPAD(seq_ticket.NEXTVAL, 8, '0');
        INSERT INTO ticket (ticket_id, booking_id, schedule_id, ticket_type, pnr, status)
        VALUES (seq_ticket.NEXTVAL, v_bid, p_schedule_id, 'W', v_pnr, 'WL')
        RETURNING ticket_id INTO v_tid;

        SELECT NVL(MAX(position),0) + 1 INTO v_position FROM waitlist_queue
         WHERE schedule_id = p_schedule_id AND coach_class = p_coach_class;
        INSERT INTO waitlisted_ticket (ticket_id, position) VALUES (v_tid, v_position);
        INSERT INTO waitlist_queue (queue_id, schedule_id, coach_class, ticket_id, position, queue_type)
        VALUES (seq_waitlist.NEXTVAL, p_schedule_id, p_coach_class, v_tid, v_position, 'WL');

        v_ticket_status := 'WL';
      END IF;

      IF v_ticket_status IS NULL THEN
        RAISE_APPLICATION_ERROR(-20051,
          'no availability (free/RAC/waitlist exhausted) for schedule ' || p_schedule_id ||
          ' class ' || p_coach_class);
      END IF;
    END IF;

    -- Itemised fare lines for auditing (only when the fare was computed).
    IF p_fare IS NULL OR p_fare = 0 THEN
      v_lines := pkg_fare.fare_lines();
      pkg_fare.fare_breakdown(v_train_id, p_coach_class, v_distance, v_journey_date, v_lines);
      FOR i IN 1 .. v_lines.COUNT LOOP
        INSERT INTO fare_breakup (fare_id, booking_id, component, amount)
        VALUES (seq_fare_breakup.NEXTVAL, v_bid, v_lines(i).component, v_lines(i).amount);
      END LOOP;
    END IF;

    INSERT INTO booking_audit(audit_id,booking_id,event_type,after_state,performed_by)
    VALUES(seq_booking_audit.NEXTVAL,v_bid,'TICKET_BOOKED',v_ticket_status,p_passenger_id);
    COMMIT;

    o_booking_id    := v_bid;
    o_ticket_id     := v_tid;
    o_pnr           := v_pnr;
    o_ticket_status := v_ticket_status;
  EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END book_ticket;

  PROCEDURE cancel_ticket(p_booking_id IN NUMBER, o_refund_amount OUT NUMBER) IS
    v_booking booking%ROWTYPE;
    v_ticket_id NUMBER;
    v_ticket_type CHAR(1);
    v_promoted NUMBER;
    v_next NUMBER;
    v_seat NUMBER;
    v_coach NUMBER;
    v_berth VARCHAR2(12);
    v_lock NUMBER;
    v_payment NUMBER;
  BEGIN
    -- Use the same schedule lock for reserve and cancel, preserving FIFO under concurrency.
    SELECT schedule_id INTO v_lock FROM booking WHERE booking_id = p_booking_id;
    SELECT schedule_id INTO v_lock FROM train_schedule WHERE schedule_id = v_lock FOR UPDATE;
    SELECT * INTO v_booking FROM booking WHERE booking_id = p_booking_id FOR UPDATE;
    IF v_booking.status <> 'BOK' THEN
      RAISE_APPLICATION_ERROR(-20052, 'This booking is already cancelled');
    END IF;
    SELECT ticket_id,ticket_type INTO v_ticket_id,v_ticket_type FROM ticket WHERE booking_id=p_booking_id;
    UPDATE booking SET status='CAN' WHERE booking_id=p_booking_id;
    UPDATE ticket SET status='CNL' WHERE ticket_id=v_ticket_id;
    DELETE FROM waitlist_queue WHERE ticket_id=v_ticket_id;
    DELETE FROM rac_ticket WHERE ticket_id=v_ticket_id;
    DELETE FROM waitlisted_ticket WHERE ticket_id=v_ticket_id;
    DELETE FROM confirmed_ticket WHERE ticket_id=v_ticket_id;
    DELETE FROM seat_segment WHERE booking_id=p_booking_id;
    IF v_ticket_type='C' THEN
      v_seat:=v_booking.seat_id;
      SELECT coach_id,berth_type INTO v_coach,v_berth FROM seat WHERE seat_id=v_seat;
      UPDATE seat SET status='A', current_from_stop=NULL,current_to_stop=NULL,version=version+1 WHERE seat_id=v_seat;
      -- RAC takes priority; otherwise the oldest waitlisted passenger gets the seat directly.
      BEGIN
        SELECT ticket_id INTO v_promoted FROM (
          SELECT ticket_id FROM waitlist_queue
          WHERE schedule_id=v_booking.schedule_id AND coach_class=v_booking.coach_class
          ORDER BY CASE queue_type WHEN 'RAC' THEN 0 ELSE 1 END,position) WHERE ROWNUM=1;
        DELETE FROM rac_ticket WHERE ticket_id=v_promoted;
        DELETE FROM waitlisted_ticket WHERE ticket_id=v_promoted;
        DELETE FROM waitlist_queue WHERE ticket_id=v_promoted;
        INSERT INTO confirmed_ticket(ticket_id,coach_id,seat_id,berth,from_stop_order,to_stop_order)
        SELECT v_promoted,v_coach,v_seat,v_berth,b.from_stop_order,b.to_stop_order
          FROM booking b JOIN ticket t ON t.booking_id=b.booking_id WHERE t.ticket_id=v_promoted;
        UPDATE ticket SET status='CFM',ticket_type='C' WHERE ticket_id=v_promoted;
        UPDATE booking SET coach_id=v_coach,seat_id=v_seat WHERE booking_id=(SELECT booking_id FROM ticket WHERE ticket_id=v_promoted);
        UPDATE seat SET status='R',version=version+1,
          current_from_stop=(SELECT from_stop_order FROM confirmed_ticket WHERE ticket_id=v_promoted),
          current_to_stop=(SELECT to_stop_order FROM confirmed_ticket WHERE ticket_id=v_promoted) WHERE seat_id=v_seat;
        INSERT INTO seat_segment(segment_id,seat_id,from_stop,to_stop,status,booking_id)
        SELECT seq_seat_segment.NEXTVAL,v_seat,b.from_stop_order,b.to_stop_order,'O',b.booking_id
          FROM booking b JOIN ticket t ON t.booking_id=b.booking_id WHERE t.ticket_id=v_promoted;
        INSERT INTO booking_audit(audit_id,booking_id,event_type,before_state,after_state)
        SELECT seq_booking_audit.NEXTVAL,booking_id,'TICKET_PROMOTED','QUEUE','CFM' FROM ticket WHERE ticket_id=v_promoted;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    END IF;
    -- A vacant RAC slot is filled by the oldest WL ticket, with its original FIFO position.
    IF v_ticket_type IN ('C','R') THEN
      DECLARE v_capacity NUMBER; v_used NUMBER; BEGIN
        SELECT rac_capacity INTO v_capacity FROM schedule_class_policy WHERE schedule_id=v_booking.schedule_id AND coach_class=v_booking.coach_class;
        SELECT COUNT(*) INTO v_used FROM waitlist_queue WHERE schedule_id=v_booking.schedule_id AND coach_class=v_booking.coach_class AND queue_type='RAC';
        IF v_used<v_capacity THEN
          SELECT ticket_id INTO v_next FROM (SELECT ticket_id FROM waitlist_queue
            WHERE schedule_id=v_booking.schedule_id AND coach_class=v_booking.coach_class AND queue_type='WL' ORDER BY position) WHERE ROWNUM=1;
          SELECT MIN(s.seat_id) INTO v_seat FROM seat s JOIN coach c ON c.coach_id=s.coach_id
            WHERE c.schedule_id=v_booking.schedule_id AND c.coach_class=v_booking.coach_class AND s.status='R';
          IF v_seat IS NOT NULL THEN
            SELECT coach_id INTO v_coach FROM seat WHERE seat_id=v_seat;
            INSERT INTO rac_ticket(ticket_id,coach_id,seat_id) VALUES(v_next,v_coach,v_seat);
            DELETE FROM waitlisted_ticket WHERE ticket_id=v_next;
            UPDATE waitlist_queue SET queue_type='RAC' WHERE ticket_id=v_next;
            UPDATE ticket SET status='RAC',ticket_type='R' WHERE ticket_id=v_next;
            INSERT INTO booking_audit(audit_id,booking_id,event_type,before_state,after_state)
            SELECT seq_booking_audit.NEXTVAL,booking_id,'TICKET_PROMOTED','WL','RAC' FROM ticket WHERE ticket_id=v_next;
          END IF;
        END IF;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    END IF;
    o_refund_amount:=0;
    FOR pay IN (SELECT payment_id,amount FROM payment WHERE booking_id=p_booking_id AND status='CAP') LOOP
      INSERT INTO refund(refund_id,payment_id,amount,reason,status,requester_request_id)
      VALUES(seq_refund.NEXTVAL,pay.payment_id,pay.amount,'booking cancelled','REQ','CANCEL-'||pay.payment_id);
      o_refund_amount:=o_refund_amount+pay.amount;
      UPDATE payment SET status='REF' WHERE payment_id=pay.payment_id;
    END LOOP;
    INSERT INTO booking_audit(audit_id,booking_id,event_type,before_state,after_state,performed_by)
    VALUES(seq_booking_audit.NEXTVAL,p_booking_id,'TICKET_CANCELLED','BOK','CAN',v_booking.person_id);
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
  END cancel_ticket;
END pkg_booking;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_booking installed