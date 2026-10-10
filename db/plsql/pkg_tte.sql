-- =============================================================================
-- RailNexus - Phase 3: pkg_tte (TTE console support: passenger list + boarding).
-- Runs in the shared schema and every zone schema. The TTE duty assignment has
-- a zone, and tickets for a schedule live in the schedule's home zone, so the
-- console calls this package against the owning zone through the zone router.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_tte IS
  TYPE ticket_row IS RECORD (
    pnr            VARCHAR2(10),
    passenger_name VARCHAR2(100),
    coach_no       VARCHAR2(8),
    seat_no        VARCHAR2(6),
    berth          VARCHAR2(12),
    ticket_status  VARCHAR2(4),
    boarding_status CHAR(1)
  );
  TYPE ticket_tab IS TABLE OF ticket_row;

  PROCEDURE list_schedule_tickets(
    p_schedule_id IN NUMBER,
    o_tickets     OUT pkg_tte.ticket_tab
  );

  PROCEDURE board_ticket(
    p_pnr     IN VARCHAR2,
    o_message OUT VARCHAR2
  );

  FUNCTION on_board_count(p_schedule_id IN NUMBER) RETURN NUMBER;
END pkg_tte;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_tte IS
  PROCEDURE list_schedule_tickets(
    p_schedule_id IN NUMBER,
    o_tickets     OUT pkg_tte.ticket_tab
  ) IS
  BEGIN
    SELECT t.pnr, p.full_name,
           c.coach_no, s.seat_no, ct.berth, t.status,
           ct.boarding_status
      BULK COLLECT INTO o_tickets
      FROM ticket t
      JOIN booking b ON b.booking_id = t.booking_id
      JOIN person p ON p.person_id = b.person_id
      LEFT JOIN confirmed_ticket ct ON ct.ticket_id = t.ticket_id
      LEFT JOIN coach c ON c.coach_id = ct.coach_id OR c.coach_id = b.coach_id
      LEFT JOIN seat s ON s.seat_id = ct.seat_id OR s.seat_id = b.seat_id
     WHERE t.schedule_id = p_schedule_id AND t.status IN ('CFM','RAC')
     ORDER BY c.coach_no, s.seat_no;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN o_tickets := pkg_tte.ticket_tab();
  END list_schedule_tickets;

  PROCEDURE board_ticket(
    p_pnr     IN VARCHAR2,
    o_message OUT VARCHAR2
  ) IS
    v_ticket NUMBER(14);
  BEGIN
    SELECT t.ticket_id INTO v_ticket
      FROM ticket t
      WHERE t.pnr = p_pnr AND t.status = 'CFM'
        AND EXISTS (SELECT 1 FROM confirmed_ticket ct WHERE ct.ticket_id = t.ticket_id)
      FOR UPDATE;

    UPDATE confirmed_ticket
       SET boarding_status = 'B', boarding_time = SYSTIMESTAMP
     WHERE ticket_id = v_ticket AND boarding_status = 'N';
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20071, 'ticket ' || p_pnr || ' is not boardable');
    END IF;

    o_message := 'boarding confirmed for PNR ' || p_pnr;
    COMMIT;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20072, 'no confirmed ticket with PNR ' || p_pnr);
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END board_ticket;

  FUNCTION on_board_count(p_schedule_id IN NUMBER) RETURN NUMBER IS
    v_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_cnt
      FROM ticket t JOIN confirmed_ticket ct ON ct.ticket_id = t.ticket_id
     WHERE t.schedule_id = p_schedule_id AND ct.boarding_status = 'B';
    RETURN v_cnt;
  END on_board_count;
END pkg_tte;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_tte installed