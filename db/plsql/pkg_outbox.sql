-- =============================================================================
-- RailNexus - Phase 5: pkg_outbox - durable outbox delivery helpers.
-- Runs in the shared schema and every zone schema. The outbox rows are written
-- by trg_audit_to_outbox in the SAME transaction as the audit event. A backend
-- relay (backend/src/outbox/outboxRelay.ts) drains them to Redis pub/sub and
-- MongoDB, then calls mark_delivered(). Failures back off and give up after 5
-- attempts; nothing is silently lost.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_outbox IS
  PROCEDURE mark_delivered(p_event_id IN NUMBER);
  PROCEDURE mark_failed(p_event_id IN NUMBER, p_error IN VARCHAR2 DEFAULT NULL);
  FUNCTION pending_count RETURN NUMBER;
  PROCEDURE schedule_retry(p_event_id IN NUMBER);
END pkg_outbox;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_outbox IS
  PROCEDURE mark_delivered(p_event_id IN NUMBER) IS
  BEGIN
    UPDATE domain_outbox
       SET status = 'S', delivered_at = SYSTIMESTAMP
     WHERE event_id = p_event_id AND status = 'N';
    COMMIT;
  END mark_delivered;

  PROCEDURE mark_failed(p_event_id IN NUMBER, p_error IN VARCHAR2 DEFAULT NULL) IS
    v_attempts NUMBER;
    v_next TIMESTAMP;
  BEGIN
    SELECT attempts + 1 INTO v_attempts FROM domain_outbox WHERE event_id = p_event_id FOR UPDATE;
    IF v_attempts >= 5 THEN
      UPDATE domain_outbox
         SET status = 'F', attempts = v_attempts
       WHERE event_id = p_event_id;
    ELSE
      v_next := SYSTIMESTAMP + NUMTODSINTERVAL(v_attempts * 10, 'SECOND');
      UPDATE domain_outbox
         SET attempts = v_attempts, next_attempt = v_next
       WHERE event_id = p_event_id;
    END IF;
    COMMIT;
  END mark_failed;

  FUNCTION pending_count RETURN NUMBER IS
    v_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_cnt FROM domain_outbox WHERE status = 'N';
    RETURN v_cnt;
  END pending_count;

  PROCEDURE schedule_retry(p_event_id IN NUMBER) IS
  BEGIN
    UPDATE domain_outbox
       SET status = 'N', next_attempt = SYSTIMESTAMP, attempts = 0
     WHERE event_id = p_event_id;
    COMMIT;
  END schedule_retry;
END pkg_outbox;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_outbox installed