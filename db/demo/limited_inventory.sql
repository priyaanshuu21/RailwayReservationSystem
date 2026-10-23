-- One-time conversion of existing October inventory. Cancellation history is retained.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE inventory_migration (migration_key VARCHAR2(80) PRIMARY KEY, applied_at TIMESTAMP DEFAULT SYSTIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE; END IF;
END;
/
DECLARE
  n NUMBER; refund NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM inventory_migration WHERE migration_key='OCT26_TWO_SEATS_V1';
  IF n=0 THEN
    FOR b IN (SELECT b.booking_id FROM booking b JOIN train_schedule ts ON ts.schedule_id=b.schedule_id
      WHERE b.status='BOK' AND ts.journey_date>=DATE '2026-10-01' AND ts.journey_date<DATE '2026-10-31'
      ORDER BY b.booking_id) LOOP
      pkg_booking.cancel_ticket(b.booking_id,refund);
    END LOOP;
    FOR c IN (SELECT DISTINCT c.schedule_id,c.coach_class FROM coach c JOIN train_schedule ts ON ts.schedule_id=c.schedule_id
      WHERE ts.journey_date>=DATE '2026-10-01' AND ts.journey_date<DATE '2026-10-31') LOOP
      -- Keep exactly two usable seats. Historical foreign-key references remain blocked.
      UPDATE seat SET status='B',current_from_stop=NULL,current_to_stop=NULL
        WHERE coach_id IN (SELECT coach_id FROM coach WHERE schedule_id=c.schedule_id AND coach_class=c.coach_class);
      UPDATE seat SET status='A' WHERE seat_id IN
        (SELECT seat_id FROM (SELECT s.seat_id FROM seat s JOIN coach ch ON ch.coach_id=s.coach_id
          WHERE ch.schedule_id=c.schedule_id AND ch.coach_class=c.coach_class ORDER BY s.seat_id) WHERE ROWNUM<=2);
      DELETE FROM seat_segment WHERE seat_id IN (SELECT s.seat_id FROM seat s JOIN coach ch ON ch.coach_id=s.coach_id
        WHERE ch.schedule_id=c.schedule_id AND ch.coach_class=c.coach_class AND s.status='B');
      DELETE FROM seat WHERE status='B' AND coach_id IN
        (SELECT coach_id FROM coach WHERE schedule_id=c.schedule_id AND coach_class=c.coach_class)
        AND seat_id NOT IN (SELECT seat_id FROM confirmed_ticket)
        AND seat_id NOT IN (SELECT seat_id FROM rac_ticket);
      UPDATE coach ch SET coach_capacity=(SELECT COUNT(*) FROM seat s WHERE s.coach_id=ch.coach_id AND s.status='A'),
        class_quota=(SELECT COUNT(*) FROM seat s WHERE s.coach_id=ch.coach_id AND s.status='A')
        WHERE ch.schedule_id=c.schedule_id AND ch.coach_class=c.coach_class;
      UPDATE schedule_class_policy SET rac_capacity=1,waitlist_limit=5
        WHERE schedule_id=c.schedule_id AND coach_class=c.coach_class;
    END LOOP;
    INSERT INTO inventory_migration(migration_key) VALUES('OCT26_TWO_SEATS_V1');
    COMMIT;
  END IF;
END;
/
