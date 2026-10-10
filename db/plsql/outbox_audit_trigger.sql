-- =============================================================================
-- RailNexus - Phase 3: booking_audit -> domain_outbox bridge.
-- Runs in the shared schema and every zone schema. AFTER INSERT on
-- BOOKING_AUDIT writes a JSON-ish event to DOMAIN_OUTBOX in the SAME local
-- transaction, so nothing is lost even though the downstream consumers
-- (Redis pub/sub, Mongo snapshot, notifications) are asynchronous.
-- The relay that hoists events out of the outbox is Phase 5 (pkg_outbox).
-- 11g-compatible: payload is a hand-built string, not JSON_OBJECT.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE TRIGGER trg_audit_to_outbox
AFTER INSERT ON booking_audit FOR EACH ROW
DECLARE
  v_payload CLOB;
BEGIN
  v_payload := '{"event":"BOOKING_AUDIT","audit_id":' || TO_CHAR(:NEW.audit_id) ||
               ',"booking_id":' || TO_CHAR(:NEW.booking_id) ||
               ',"event_type":"' || REPLACE(:NEW.event_type, '"', ' ') || '"}';
  INSERT INTO domain_outbox (event_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (seq_outbox.NEXTVAL, 'BOOKING_AUDIT', 'BOOKING', TO_CHAR(:NEW.booking_id), v_payload);
END;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT Outbox audit trigger installed