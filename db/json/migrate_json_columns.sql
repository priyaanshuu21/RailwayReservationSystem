-- =============================================================================
-- RailNexus - Phase 5: semi-structured (JSON) columns on the relational core.
-- Runs as RAILNEXUS. The JSON text columns keep the 11g CHECK (LIKE '{%') so
-- the same schema installs on 11g .. 23ai; on 12.2+ you can replace the CHECK
-- with IS JSON and add a JSON search/functional index (documented in
-- docs/schema-notes.md). Parse helpers live in pkg_json_rules.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- TRAIN: operational/amenity metadata doc (version-guarded, added in Phase 5).
ALTER TABLE train ADD metadata_json CLOB;
ALTER TABLE train ADD CONSTRAINT ck_train_meta_json
  CHECK (metadata_json IS NULL OR metadata_json LIKE '{%');

-- STATION_ANNOUNCEMENT: flexible per-announcement extras (targets, zones...).
ALTER TABLE station_announcement ADD extra_json CLOB;
ALTER TABLE station_announcement ADD CONSTRAINT ck_ann_extra_json
  CHECK (extra_json IS NULL OR extra_json LIKE '{%');

UPDATE train SET metadata_json =
  '{"amenities":{"pantry":true,"wifi":false},"class_map":{"1A":"AC First","2A":"AC Two-Tier","3A":"AC Three-Tier","SL":"Sleeper"}}'
 WHERE train_type IN ('E','S');
UPDATE train SET metadata_json =
  '{"amenities":{"pantry":false,"wifi":true},"class_map":{"SL":"Sleeper","2S":"Second Seating"}}'
 WHERE train_type = 'P';
UPDATE train SET metadata_json =
  '{"amenities":{"pantry":false,"wifi":false},"cargo":"freight","bookable":false}'
 WHERE train_type = 'F';

UPDATE station_announcement SET extra_json =
  '{"channels":["sms","app"],"priority":"medium"}' 
 WHERE extra_json IS NULL;

COMMIT;
WHENEVER SQLERROR EXIT
PROMPT JSON columns migrated