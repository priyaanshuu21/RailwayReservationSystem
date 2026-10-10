-- =============================================================================
-- RailNexus - Phase 5: pkg_json_rules - JSON rule-document engine.
-- Runs in the shared schema and every zone schema (FARE_RULE resolves through
-- the zone synonyms). Parses the fare_rule.fare_json CLOB documents with
-- REGEXP_SUBSTR so the same code runs on 11g; on 12.2+ JSON_TABLE is the
-- drop-in upgrade (commented example in each helper).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_json_rules IS
  FUNCTION json_number(p_doc IN CLOB, p_key IN VARCHAR2) RETURN NUMBER;
  FUNCTION json_str(p_doc IN CLOB, p_key IN VARCHAR2) RETURN VARCHAR2;
  FUNCTION supplement_amount(p_doc IN CLOB, p_type IN VARCHAR2) RETURN NUMBER;
  FUNCTION fare_for(
    p_train_type   IN VARCHAR2,
    p_coach_class  IN VARCHAR2,
    p_distance_km  IN NUMBER
  ) RETURN NUMBER;
END pkg_json_rules;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_json_rules IS
  FUNCTION json_number(p_doc IN CLOB, p_key IN VARCHAR2) RETURN NUMBER IS
    v_txt VARCHAR2(100);
  BEGIN
    -- "key": <number> with optional whitespace. 12.2+: JSON_VALUE(p_doc, '$.key').
    v_txt := REGEXP_SUBSTR(p_doc,
              '"' || p_key || '"\s*:\s*(-?[0-9]+(\.[0-9]+)?)', 1, 1, NULL, 1);
    RETURN TO_NUMBER(v_txt);
  END json_number;

  FUNCTION json_str(p_doc IN CLOB, p_key IN VARCHAR2) RETURN VARCHAR2 IS
    v_txt VARCHAR2(100);
  BEGIN
    v_txt := REGEXP_SUBSTR(p_doc,
              '"' || p_key || '"\s*:\s*"([^"]*)"', 1, 1, NULL, 1);
    RETURN v_txt;
  END json_str;

  FUNCTION supplement_amount(p_doc IN CLOB, p_type IN VARCHAR2) RETURN NUMBER IS
    v_val VARCHAR2(100);
  BEGIN
    -- {"supplements":[{"type":"SUPERFAST","amount":45}, ...]}
    v_val := REGEXP_SUBSTR(p_doc,
              '"type"\s*:\s*"' || p_type || '"\s*,\s*"amount"\s*:\s*"?([0-9.]+)"?',
              1, 1, NULL, 1);
    RETURN NVL(TO_NUMBER(v_val), 0);
  END supplement_amount;

  FUNCTION fare_for(
    p_train_type   IN VARCHAR2,
    p_coach_class  IN VARCHAR2,
    p_distance_km  IN NUMBER
  ) RETURN NUMBER IS
    v_doc CLOB;
    v_base NUMBER;
    v_min  NUMBER;
    v_max  NUMBER;
    v_supp NUMBER;
    v_total NUMBER;
  BEGIN
    SELECT fare_json INTO v_doc
      FROM fare_rule
     WHERE train_type = p_train_type AND coach_class = p_coach_class
       AND ROWNUM = 1;

    v_base := ROUND(json_number(v_doc, 'base_rate') * NVL(p_distance_km, 0), 2);
    v_min  := NVL(json_number(v_doc, 'min_fare'), 0);
    v_max  := NVL(json_number(v_doc, 'max_fare'), v_base);
    v_base := LEAST(GREATEST(v_base, v_min), v_max);
    v_supp := supplement_amount(v_doc, 'SUPERFAST');

    -- dynamic factor demo: normal demand = 1.0
    v_total := ROUND(v_base + v_supp, 2);
    RETURN v_total;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20101,
        'no fare rule document for ' || p_train_type || '/' || p_coach_class);
  END fare_for;
END pkg_json_rules;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_json_rules installed