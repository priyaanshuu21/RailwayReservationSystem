-- =============================================================================
-- RailNexus - Phase 4: object table + REF navigation for the journey model.
-- Runs as RAILNEXUS, AFTER route_journey_types.sql.
--   * route_journey_tab  - object table of journeys (nested segments stored in
--     a companion storage table route_segments_st).
--   * train_route_or     - each train holds a REF to its journey object; the
--     TRAIN -> REF -> JOURNEY.segments path is the object-relational traversal
--     the UI coaches report uses.
-- Rows are rebuilt from the relational source of truth (pkg_journey refresh).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DROP TABLE route_journey_tab PURGE;
DROP TABLE train_route_or PURGE;

CREATE TABLE route_journey_tab OF route_journey_t (
  PRIMARY KEY (route_id)
)
NESTED TABLE segments STORE AS route_segments_st;

CREATE TABLE train_route_or (
  train_id NUMBER(10) NOT NULL,
  journey  REF route_journey_t,
  CONSTRAINT pk_train_route_or PRIMARY KEY (train_id)
);

-- Build one journey object per logical route from the relational stops.
BEGIN
  FOR rec IN (SELECT route_id, route_code FROM route ORDER BY route_id) LOOP
    INSERT INTO route_journey_tab
    VALUES (route_journey_t(
      rec.route_id,
      rec.route_code,
      CAST(MULTISET (
        SELECT segment_t(sr.stop_order, sr.station_id, sr.km_from_origin,
                         sr.arrival, sr.departure)
          FROM station_route sr
         WHERE sr.route_id = rec.route_id
         ORDER BY sr.stop_order) AS segment_tab_t)));
  END LOOP;
  COMMIT;
END;
/

-- Point every active train at its journey object (REF materialisation).
INSERT INTO train_route_or (train_id, journey)
SELECT tr.train_id, REF(j)
  FROM train_route tr
  JOIN route_journey_tab j ON j.route_id = tr.route_id
 WHERE tr.is_active = 1;

-- Sanity: how many objects + REFs got linked.
SELECT (SELECT COUNT(*) FROM route_journey_tab) AS journeys,
       (SELECT COUNT(*) FROM train_route_or)   AS refs_linked FROM DUAL;

WHENEVER SQLERROR EXIT
PROMPT Object-relational storage seeded