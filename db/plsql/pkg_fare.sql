-- =============================================================================
-- RailNexus - Phase 3: pkg_fare (rate engine).
-- Runs in the shared schema AND every zone schema (ZONEALL in the manifest):
-- FARE_RULE, TRAIN and SUPERFAST_TRAIN resolve through local tables in the
-- shared schema and through the phase-2 synonyms in the zone schemas.
--
-- Rules
--   * base = price band (base_rate_per_km * distance) clamped to min/max fare.
--   * superfast trains add their per-ticket superfast_surcharge.
--   * the effective fare rule is the one whose effective_from <= journey date
--     with the LATEST such date (versioning demo).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_fare IS
  -- Itemised view of a fare; the API serialises this for the UI.
  TYPE fare_line IS RECORD (
    component  VARCHAR2(30),
    amount     NUMBER(12,2)
  );
  TYPE fare_lines IS TABLE OF fare_line;

  FUNCTION compute_fare(
    p_train_id     IN NUMBER,
    p_coach_class  IN VARCHAR2,
    p_distance_km  IN NUMBER,
    p_journey_date IN DATE DEFAULT SYSDATE
  ) RETURN NUMBER;

  PROCEDURE fare_breakdown(
    p_train_id     IN NUMBER,
    p_coach_class  IN VARCHAR2,
    p_distance_km  IN NUMBER,
    p_journey_date IN DATE DEFAULT SYSDATE,
    o_lines        OUT pkg_fare.fare_lines
  );
END pkg_fare;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_fare IS
  FUNCTION compute_fare(
    p_train_id     IN NUMBER,
    p_coach_class  IN VARCHAR2,
    p_distance_km  IN NUMBER,
    p_journey_date IN DATE DEFAULT SYSDATE
  ) RETURN NUMBER IS
    v_base      NUMBER(12,2);
    v_surcharge NUMBER(12,2);
    v_min       NUMBER(12,2);
    v_max       NUMBER(12,2);
    v_total     NUMBER(12,2);
  BEGIN
    SELECT fr.base_rate_per_km, fr.min_fare, fr.max_fare, sf.superfast_surcharge
      INTO v_base, v_min, v_max, v_surcharge
      FROM train t
      JOIN fare_rule fr
        ON fr.train_type = t.train_type
       AND fr.coach_class = p_coach_class
       AND fr.effective_from = (
             SELECT MAX(fr2.effective_from)
               FROM fare_rule fr2
              WHERE fr2.train_type = t.train_type
                AND fr2.coach_class = fr.coach_class
                AND fr2.effective_from <= TRUNC(NVL(p_journey_date, SYSDATE)))
      LEFT JOIN superfast_train sf ON sf.train_id = t.train_id
     WHERE t.train_id = p_train_id;

    v_base      := ROUND(NVL(v_base, 0) * NVL(p_distance_km, 0), 2);
    v_base      := LEAST(GREATEST(v_base, v_min), v_max);
    v_surcharge := ROUND(NVL(v_surcharge, 0), 2);
    v_total     := ROUND(v_base + v_surcharge, 2);
    RETURN v_total;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20041,
        'no fare rule for class ' || p_coach_class || ' on train ' || p_train_id);
  END compute_fare;

  PROCEDURE fare_breakdown(
    p_train_id     IN NUMBER,
    p_coach_class  IN VARCHAR2,
    p_distance_km  IN NUMBER,
    p_journey_date IN DATE DEFAULT SYSDATE,
    o_lines        OUT pkg_fare.fare_lines
  ) IS
    v_base      NUMBER(12,2);
    v_surcharge NUMBER(12,2);
    v_min       NUMBER(12,2);
    v_max       NUMBER(12,2);
    v_total     NUMBER(12,2);
  BEGIN
    SELECT fr.base_rate_per_km, fr.min_fare, fr.max_fare, sf.superfast_surcharge
      INTO v_base, v_min, v_max, v_surcharge
      FROM train t
      JOIN fare_rule fr
        ON fr.train_type = t.train_type
       AND fr.coach_class = p_coach_class
       AND fr.effective_from = (
             SELECT MAX(fr2.effective_from)
               FROM fare_rule fr2
              WHERE fr2.train_type = t.train_type
                AND fr2.coach_class = fr.coach_class
                AND fr2.effective_from <= TRUNC(NVL(p_journey_date, SYSDATE)))
      LEFT JOIN superfast_train sf ON sf.train_id = t.train_id
     WHERE t.train_id = p_train_id;

    v_base      := ROUND(NVL(v_base, 0) * NVL(p_distance_km, 0), 2);
    v_base      := LEAST(GREATEST(v_base, v_min), v_max);
    v_surcharge := ROUND(NVL(v_surcharge, 0), 2);
    v_total     := ROUND(v_base + v_surcharge, 2);

    o_lines := pkg_fare.fare_lines();
    o_lines.EXTEND(3);
    o_lines(1).component := 'BASE FARE';
    o_lines(1).amount    := v_base;
    o_lines(2).component := 'SUPERFAST SURCHARGE';
    o_lines(2).amount    := v_surcharge;
    o_lines(3).component := 'TOTAL';
    o_lines(3).amount    := v_total;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20041,
        'no fare rule for class ' || p_coach_class || ' on train ' || p_train_id);
  END fare_breakdown;
END pkg_fare;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_fare installed