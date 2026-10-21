-- Run inside the Oracle container, like the other demo fixtures.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE
  v_existing NUMBER;
  v_id NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_existing FROM station_announcement
    WHERE message LIKE 'October demo:%';
  IF v_existing = 0 THEN
    pkg_announcements.publish(103,
      'October demo: trains run daily from 1 to 30 October 2026. Please check your coach and berth before boarding.',
      2002,720,v_id);
  END IF;
END;
/
