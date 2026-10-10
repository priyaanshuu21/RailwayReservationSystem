-- =============================================================================
-- RailNexus - seed_helper.sql (zone_common)
-- Deterministic coach + seat generation for one schedule and coach class.
-- Identical behaviour in the shared schema and every zone schema so the
-- fragmentation demo sees the same generator everywhere.
-- =============================================================================

CREATE OR REPLACE PROCEDURE seed_schedule_coaches(
  p_schedule_id IN NUMBER,
  p_class       IN VARCHAR2,
  p_coach_count IN NUMBER,
  p_capacity    IN NUMBER,
  p_rac_quota   IN NUMBER
) IS
  v_coach_id  NUMBER;
  v_prefix    VARCHAR2(2);
  v_berth     VARCHAR2(3);
  TYPE berth_tab IS TABLE OF VARCHAR2(3);
  v_berths    berth_tab := berth_tab('LB','MB','UB','SU','LB','MB','UB','SL');
BEGIN
  v_prefix := CASE p_class
                WHEN 'SL' THEN 'S' WHEN '3A' THEN 'D'
                WHEN '2A' THEN 'B' WHEN '1A' THEN 'A'
                ELSE 'C' END;
  FOR c IN 1 .. p_coach_count LOOP
    INSERT INTO coach (coach_id, schedule_id, coach_no, coach_class, coach_capacity, class_quota)
    VALUES (seq_coach.NEXTVAL, p_schedule_id, v_prefix || LPAD(c, 2, '0'), p_class, p_capacity, p_capacity)
    RETURNING coach_id INTO v_coach_id;

    FOR s IN 1 .. p_capacity LOOP
      v_berth := v_berths(MOD(s - 1, v_berths.COUNT) + 1);
      INSERT INTO seat (seat_id, coach_id, seat_no, berth_type, status, version)
      VALUES (seq_seat.NEXTVAL, v_coach_id, v_prefix || LPAD(s, 2, '0'), v_berth, 'A', 0);
      -- Pre-seed one free segment row covering the whole route so segment
      -- validation has rows to lock against in the booking engine.
      INSERT INTO seat_segment (segment_id, seat_id, from_stop, to_stop, status)
      VALUES (seq_seat_segment.NEXTVAL, seq_seat.CURRVAL, 1,
              (SELECT MAX(stop_order) FROM station_route
                WHERE route_id = (SELECT route_id FROM train_schedule WHERE schedule_id = p_schedule_id)),
              'F');
    END LOOP;
  END LOOP;

  BEGIN
    INSERT INTO schedule_class_policy (schedule_id, coach_class, rac_capacity, waitlist_limit)
    VALUES (p_schedule_id, p_class, p_rac_quota, 50);
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
  END;
END seed_schedule_coaches;
/