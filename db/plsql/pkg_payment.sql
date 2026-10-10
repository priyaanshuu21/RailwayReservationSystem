-- =============================================================================
-- RailNexus - Phase 3: pkg_payment (payment specialisation + refund requests).
-- Runs in the shared schema and every zone schema. PAYMENT holds the idempotent
-- envelope (request_id, provider_ref); UPI/CARD/WALLET payload rows carry the
-- method-specific data. Card numbers never leave the wallet: the API accepts a
-- masked PAN only.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_payment IS
  PROCEDURE record_payment(
    p_booking_id    IN NUMBER,
    p_method        IN CHAR,          -- 'U' | 'C' | 'W'
    p_amount        IN NUMBER,
    p_provider_ref  IN VARCHAR2,
    p_request_id    IN VARCHAR2,      -- caller idempotency key
    p_upi_handle    IN VARCHAR2 DEFAULT NULL,
    p_masked_pan    IN VARCHAR2 DEFAULT NULL,
    p_card_scheme   IN VARCHAR2 DEFAULT NULL,
    p_wallet_provider IN VARCHAR2 DEFAULT NULL,
    p_wallet_txn    IN VARCHAR2 DEFAULT NULL,
    o_payment_id    OUT NUMBER
  );

  PROCEDURE capture_payment(p_payment_id IN NUMBER);
  PROCEDURE request_refund(
    p_payment_id IN NUMBER,
    p_amount     IN NUMBER,
    p_reason     IN VARCHAR2 DEFAULT NULL
  );
END pkg_payment;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_payment IS
  PROCEDURE record_payment(
    p_booking_id    IN NUMBER,
    p_method        IN CHAR,
    p_amount        IN NUMBER,
    p_provider_ref  IN VARCHAR2,
    p_request_id    IN VARCHAR2,
    p_upi_handle    IN VARCHAR2 DEFAULT NULL,
    p_masked_pan    IN VARCHAR2 DEFAULT NULL,
    p_card_scheme   IN VARCHAR2 DEFAULT NULL,
    p_wallet_provider IN VARCHAR2 DEFAULT NULL,
    p_wallet_txn    IN VARCHAR2 DEFAULT NULL,
    o_payment_id    OUT NUMBER
  ) IS
    v_pid NUMBER(14);
  BEGIN
    -- Idempotent replay of the same gateway request.
    IF p_request_id IS NOT NULL THEN
      BEGIN
        SELECT payment_id INTO v_pid FROM payment WHERE request_id = p_request_id;
        o_payment_id := v_pid;
        RETURN;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
    END IF;

    INSERT INTO payment (payment_id, booking_id, payment_method, amount, status,
                         provider_ref, request_id)
    VALUES (seq_payment.NEXTVAL, p_booking_id, p_method, p_amount, 'PND',
            p_provider_ref, p_request_id)
    RETURNING payment_id INTO v_pid;

    IF p_method = 'U' THEN
      INSERT INTO upi_payment (payment_id, upi_handle) VALUES (v_pid, p_upi_handle);
    ELSIF p_method = 'C' THEN
      INSERT INTO card_payment (payment_id, masked_pan, card_scheme) VALUES (v_pid, p_masked_pan, p_card_scheme);
    ELSIF p_method = 'W' THEN
      INSERT INTO wallet_payment (payment_id, wallet_provider, wallet_txn_id) VALUES (v_pid, p_wallet_provider, p_wallet_txn);
    ELSE
      RAISE_APPLICATION_ERROR(-20061, 'unsupported payment method ' || p_method);
    END IF;

    o_payment_id := v_pid;
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END record_payment;

  PROCEDURE capture_payment(p_payment_id IN NUMBER) IS
    v_booking NUMBER(12);
  BEGIN
    UPDATE payment SET status = 'CAP', processed_at = SYSTIMESTAMP
     WHERE payment_id = p_payment_id AND status = 'PND';
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20062, 'payment ' || p_payment_id || ' is not capturable');
    END IF;
    SELECT booking_id INTO v_booking FROM payment WHERE payment_id = p_payment_id;
    UPDATE booking SET status = 'BOK' WHERE booking_id = v_booking AND status = 'BOK';

    INSERT INTO booking_audit (audit_id, booking_id, event_type, before_state, after_state, performed_by)
    VALUES (seq_booking_audit.NEXTVAL, v_booking, 'PAYMENT_CAPTURED',
            'PND', 'CAP', NULL);

    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END capture_payment;

  PROCEDURE request_refund(
    p_payment_id IN NUMBER,
    p_amount     IN NUMBER,
    p_reason     IN VARCHAR2 DEFAULT NULL
  ) IS
    v_booking NUMBER(12);
  BEGIN
    SELECT booking_id INTO v_booking FROM payment WHERE payment_id = p_payment_id;
    INSERT INTO refund (refund_id, payment_id, amount, reason, status, requester_request_id)
    VALUES (seq_refund.NEXTVAL, p_payment_id, p_amount, p_reason, 'REQ',
            'RF-' || TO_CHAR(p_payment_id) || '-' || TRUNC(DBMS_RANDOM.VALUE * 1000000));
    COMMIT;
  EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
  END request_refund;
END pkg_payment;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_payment installed