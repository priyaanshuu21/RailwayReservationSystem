-- =============================================================================
-- RailNexus - Phase 4: object-relational types for the journey model.
-- Runs as RAILNEXUS. A route is modelled as an OBJECT whose SEGMENTS nested
-- table holds the ordered stop list - the object-relational incarnation of the
-- relational ROUTE + STATION_ROUTE model from Phase 1. The object layer is a
-- denormalised mirror: pkg_journey.refresh_object_table() rebuilds it from the
-- relational source of truth, so there is no conflicting master.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- One ordered stop on a route.
CREATE OR REPLACE TYPE segment_t AS OBJECT (
  stop_order     NUMBER(3),
  station_id     NUMBER(10),
  km_from_origin NUMBER(6),
  arrival        VARCHAR2(5),
  departure      VARCHAR2(5)
);
/
SHOW ERRORS

-- Ordered collection of stops (nested-table attribute of route_journey_t).
CREATE OR REPLACE TYPE segment_tab_t AS TABLE OF segment_t;
/
SHOW ERRORS

-- A journey/route object: route identity plus its ordered segments.
CREATE OR REPLACE TYPE route_journey_t AS OBJECT (
  route_id      NUMBER(10),
  route_code    VARCHAR2(12),
  segments      segment_tab_t,
  MEMBER FUNCTION total_distance RETURN NUMBER
);
/
SHOW ERRORS

CREATE OR REPLACE TYPE BODY route_journey_t AS
  MEMBER FUNCTION total_distance RETURN NUMBER IS
    v_km NUMBER := 0;
  BEGIN
    IF self.segments IS NOT NULL THEN
      -- cumulative kilometre markers; the member parses the object's own data
      FOR i IN 1 .. self.segments.COUNT LOOP
        v_km := GREATEST(v_km, NVL(self.segments(i).km_from_origin, 0));
      END LOOP;
    END IF;
    RETURN v_km;
  END total_distance;
END;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT Object-relational types created