-- =============================================================================
-- RailNexus - Phase 5: pkg_rules - business-rule enforcement (transaction-level
-- throttling). Runs in the shared schema and every zone schema. Integrated into
-- pkg_booking.book_ticket as the pre-flight gate so every booking path honours
-- the same rules (freight never carries passengers, per-user per-train quota).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_rules IS
  -- Passenger-carrying? Raises if the train is a freight service.
  FUNCTION can_book_passenger_train(p_train_id IN NUMBER) RETURN BOOLEAN;

  -- Throttle: at most 6 active bookings per passenger per train per day.
  FUNCTION booking_limit_ok(p_person_id IN NUMBER, p_train_id IN NUMBER, p_journey_date IN DATE)
    RETURN BOOLEAN;

  -- Combined gate used by pkg_booking.book_ticket.
  PROCEDURE enforce_booking_rules(
    p_passenger_id IN NUMBER,
    p_train_id     IN NUMBER,
    p_journey_date IN DATE
  );
END pkg_rules;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_rules IS
  FUNCTION can_book_passenger_train(p_train_id IN NUMBER) RETURN BOOLEAN IS
    v_type CHAR(1);
  BEGIN
    SELECT train_type INTO v_type FROM train WHERE train_id = p_train_id;
    RETURN v_type <> 'F';
  END can_book_passenger_train;

  FUNCTION booking_limit_ok(p_person_id IN NUMBER, p_train_id IN NUMBER, p_journey_date IN DATE)
    RETURN BOOLEAN IS
    v_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_cnt
      FROM booking b
      JOIN train_schedule s ON s.schedule_id = b.schedule_id
     WHERE b.person_id = p_person_id
       AND b.status = 'BOK'
       AND s.train_id = p_train_id
       AND s.journey_date = TRUNC(p_journey_date);
    RETURN v_cnt < 6;
  END booking_limit_ok;

  PROCEDURE enforce_booking_rules(
    p_passenger_id IN NUMBER,
    p_train_id     IN NUMBER,
    p_journey_date IN DATE
  ) IS
  BEGIN
    IF NOT can_book_passenger_train(p_train_id) THEN
      RAISE_APPLICATION_ERROR(-20091,
        'freight trains cannot carry passenger bookings (train ' || p_train_id || ')');
    END IF;
    IF NOT booking_limit_ok(p_passenger_id, p_train_id, p_journey_date) THEN
      RAISE_APPLICATION_ERROR(-20092,
        'booking limit reached (max 6 active bookings per passenger per train/day)');
    END IF;
  END enforce_booking_rules;
END pkg_rules;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_rules installed