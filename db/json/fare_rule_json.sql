-- =============================================================================
-- RailNexus - Phase 5: fare rules as JSON rule documents.
-- Runs as RAILNEXUS. Each FARE_RULE row carries its extended rule set in
-- fare_json (11g-safe: it is a CLOB checked as LIKE '{%' and parsed with
-- REGEXP_SUBSTR, no JSON_TABLE required). The relational columns remain the
-- versioned primary prices; the JSON document adds supplements and dynamic
-- factors that pkg_json_rules.fare_for folds in.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

UPDATE fare_rule SET fare_json =
  '{"base_rate":' || base_rate_per_km ||
  ',"min_fare":' || min_fare ||
  ',"max_fare":' || max_fare ||
  ',"supplements":[{"type":"SUPERFAST","amount":"' || CASE WHEN train_type='S' THEN 45 ELSE 0 END || '"}]' ||
  ',"dynamic":{"demand":"normal","factor":1.0}}'
WHERE fare_json IS NULL;

COMMIT;
WHENEVER SQLERROR EXIT
PROMPT Fare rule JSON documents written