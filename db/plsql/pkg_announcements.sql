WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE announcement_audit (audit_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    announcement_id NUMBER NOT NULL, event_type VARCHAR2(20), actor_id NUMBER, event_time TIMESTAMP DEFAULT SYSTIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE<>-955 THEN RAISE; END IF;
END;
/
CREATE OR REPLACE TRIGGER trg_announcement_audit
AFTER INSERT OR UPDATE ON station_announcement FOR EACH ROW
DECLARE v_event VARCHAR2(20);
BEGIN
  IF INSERTING THEN v_event:='PUBLISHED'; ELSE v_event:='UPDATED'; END IF;
  INSERT INTO announcement_audit(announcement_id,event_type,actor_id)
  VALUES(:NEW.announcement_id,v_event,:NEW.created_by);
END;
/
CREATE OR REPLACE PACKAGE pkg_announcements IS
  PROCEDURE publish(p_station IN NUMBER,p_message IN VARCHAR2,p_actor IN NUMBER,p_hours IN NUMBER,o_id OUT NUMBER);
END;
/
CREATE OR REPLACE PACKAGE BODY pkg_announcements IS
  PROCEDURE publish(p_station IN NUMBER,p_message IN VARCHAR2,p_actor IN NUMBER,p_hours IN NUMBER,o_id OUT NUMBER) IS
    v_allowed NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_allowed FROM station s WHERE s.station_id=p_station AND (
      EXISTS(SELECT 1 FROM super_admin WHERE employee_id=p_actor) OR
      EXISTS(SELECT 1 FROM zone_admin WHERE employee_id=p_actor AND zone_id=s.zone_id) OR
      EXISTS(SELECT 1 FROM station_master WHERE employee_id=p_actor AND station_id=s.station_id));
    IF v_allowed=0 THEN RAISE_APPLICATION_ERROR(-20081,'You cannot publish for this station'); END IF;
    IF LENGTH(TRIM(p_message))<5 OR p_hours<1 OR p_hours>720 THEN
      RAISE_APPLICATION_ERROR(-20082,'Supply a message and a lifetime of 1 to 720 hours');
    END IF;
    INSERT INTO station_announcement(station_id,message,created_by,active_until)
    VALUES(p_station,TRIM(p_message),p_actor,SYSDATE+p_hours/24) RETURNING announcement_id INTO o_id;
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
  END;
END;
/
SHOW ERRORS
