-- =============================================================================
-- RailNexus - Phase 4: pkg_journey - PL/SQL traversal over the OR journey model.
-- Runs as RAILNEXUS. Demonstrates the full object-relational path:
--   TRAIN -> REF(train_route_or.journey) -> DEREF -> route_journey_t.segments
-- and offers the same stop/distance helpers the relational API uses, so the
-- relational (Phase 1) and object-relational (Phase 4) routes stay consistent.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_journey IS
  TYPE stop_row IS RECORD (
    stop_order   NUMBER(3),
    station_code VARCHAR2(10),
    station_name VARCHAR2(80),
    km_from_origin NUMBER(6),
    arrival VARCHAR2(5),
    departure VARCHAR2(5)
  );
  TYPE stop_tab IS TABLE OF stop_row;

  -- Rebuild the object table from the relational source of truth.
  PROCEDURE refresh_object_table;

  -- OR traversal: stops of a train's journey via REF + DEREF + nested table.
  PROCEDURE print_train_route(p_train_id IN NUMBER);

  -- Relational parity helpers backed by the OR view of the world.
  FUNCTION journey_for_train(p_train_id IN NUMBER) RETURN route_journey_t;
  FUNCTION stops_between(p_train_id IN NUMBER, p_from_stop IN NUMBER, p_to_stop IN NUMBER) RETURN NUMBER;
  FUNCTION distance_between(p_train_id IN NUMBER, p_from_stop IN NUMBER, p_to_stop IN NUMBER) RETURN NUMBER;

  -- Convenience for the API layer: all stops of all active trains (via REFs).
  PROCEDURE list_all_train_segments(o_stops OUT pkg_journey.stop_tab);
END pkg_journey;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_journey IS
  PROCEDURE refresh_object_table IS
  BEGIN
    DELETE FROM train_route_or;
    DELETE FROM route_journey_tab;

    FOR rec IN (SELECT route_id, route_code FROM route ORDER BY route_id) LOOP
      INSERT INTO route_journey_tab
      VALUES (route_journey_t(
        rec.route_id,
        rec.route_code,
        CAST(MULTISET (
          SELECT segment_t(sr.stop_order, sr.station_id, sr.km_from_origin, sr.arrival, sr.departure)
            FROM station_route sr
           WHERE sr.route_id = rec.route_id
           ORDER BY sr.stop_order) AS segment_tab_t)));
    END LOOP;

    INSERT INTO train_route_or (train_id, journey)
    SELECT tr.train_id, REF(j)
      FROM train_route tr
      JOIN route_journey_tab j ON j.route_id = tr.route_id
     WHERE tr.is_active = 1;
    COMMIT;
  END refresh_object_table;

  PROCEDURE print_train_route(p_train_id IN NUMBER) IS
    v_code VARCHAR2(12);
    v_km   NUMBER;
    v_name VARCHAR2(120);
  BEGIN
    SELECT DEREF(x.journey).route_code, DEREF(x.journey).total_distance(), t.train_name
      INTO v_code, v_km, v_name
      FROM train t JOIN train_route_or x ON x.train_id = t.train_id
     WHERE t.train_id = p_train_id;

    DBMS_OUTPUT.PUT_LINE('Train ' || v_name || ' route ' || v_code ||
                         ' total ' || v_km || ' km');
    FOR seg IN (SELECT seg.*
                  FROM train t
                  JOIN train_route_or x ON x.train_id = t.train_id
                 CROSS JOIN TABLE(DEREF(x.journey).segments) seg
                 WHERE t.train_id = p_train_id) LOOP
      DBMS_OUTPUT.PUT_LINE('  stop ' || seg.stop_order || ' km ' ||
                           NVL(TO_CHAR(seg.km_from_origin), '-') ||
                           ' arr ' || NVL(seg.arrival, '-') ||
                           ' dep ' || NVL(seg.departure, '-'));
    END LOOP;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20081, 'no journey object for train ' || p_train_id);
  END print_train_route;

  FUNCTION journey_for_train(p_train_id IN NUMBER) RETURN route_journey_t IS
    v_journey route_journey_t;
  BEGIN
    SELECT DEREF(x.journey) INTO v_journey
      FROM train_route_or x WHERE x.train_id = p_train_id;
    RETURN v_journey;
  END journey_for_train;

  FUNCTION stops_between(p_train_id IN NUMBER, p_from_stop IN NUMBER, p_to_stop IN NUMBER) RETURN NUMBER IS
    v_cnt NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_cnt
      FROM (SELECT seg.stop_order
              FROM train_route_or x
             CROSS JOIN TABLE(DEREF(x.journey).segments) seg
             WHERE x.train_id = p_train_id)
     WHERE stop_order BETWEEN LEAST(p_from_stop, p_to_stop) + 1
                         AND GREATEST(p_from_stop, p_to_stop) - 1;
    RETURN v_cnt;
  END stops_between;

  FUNCTION distance_between(p_train_id IN NUMBER, p_from_stop IN NUMBER, p_to_stop IN NUMBER) RETURN NUMBER IS
    v_km NUMBER;
  BEGIN
    SELECT ABS((SELECT MAX(km_from_origin) FROM (
                  SELECT seg.km_from_origin
                    FROM train_route_or x
                   CROSS JOIN TABLE(DEREF(x.journey).segments) seg
                   WHERE x.train_id = p_train_id AND seg.stop_order = GREATEST(p_from_stop, p_to_stop)))
              -
              (SELECT MIN(km_from_origin) FROM (
                  SELECT seg.km_from_origin
                    FROM train_route_or x
                   CROSS JOIN TABLE(DEREF(x.journey).segments) seg
                   WHERE x.train_id = p_train_id AND seg.stop_order = LEAST(p_from_stop, p_to_stop))))
      INTO v_km
      FROM DUAL;
    RETURN v_km;
  END distance_between;

  PROCEDURE list_all_train_segments(o_stops OUT pkg_journey.stop_tab) IS
  BEGIN
    SELECT seg.stop_order, st.station_code, st.station_name,
           seg.km_from_origin, seg.arrival, seg.departure
      BULK COLLECT INTO o_stops
      FROM train_route_or x
      JOIN train t ON t.train_id = x.train_id AND t.train_type IN ('E','S','P')
      CROSS JOIN TABLE(DEREF(x.journey).segments) seg
      JOIN station st ON st.station_id = seg.station_id
     ORDER BY t.train_no, seg.stop_order;
  END list_all_train_segments;
END pkg_journey;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_journey installed