-- =============================================================================
-- RailNexus - Phase 2: distributed views over the three zone schemas.
-- Created in RAILNEXUS (shared schema). Every view reads zone-owned fragmented
-- tables through the ZONE_* DB links, so one catalog query returns a fully
-- federated picture without the caller knowing which zone owns what.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- Federated schedule: every train/journey across all three zone schemas.
CREATE OR REPLACE VIEW vw_all_zone_schedules AS
SELECT s.schedule_id, s.train_id, s.route_id, s.zone_id, s.journey_date,
       s.departure_time, s.arrival_time, s.status
  FROM train_schedule@ZONE_NORTH s
UNION ALL
SELECT s.schedule_id, s.train_id, s.route_id, s.zone_id, s.journey_date,
       s.departure_time, s.arrival_time, s.status
  FROM train_schedule@ZONE_WEST s
UNION ALL
SELECT s.schedule_id, s.train_id, s.route_id, s.zone_id, s.journey_date,
       s.departure_time, s.arrival_time, s.status
  FROM train_schedule@ZONE_SOUTH s;

-- Distributed inventory roll-up (coaches by class per zone).
CREATE OR REPLACE VIEW vw_zone_inventory AS
SELECT 'NORTH' AS zone_name, c.coach_class, COUNT(*) AS coach_count,
       SUM(c.coach_capacity) AS seat_capacity
  FROM coach@ZONE_NORTH c
 GROUP BY c.coach_class
UNION ALL
SELECT 'WEST', c.coach_class, COUNT(*), SUM(c.coach_capacity)
  FROM coach@ZONE_WEST c
 GROUP BY c.coach_class
UNION ALL
SELECT 'SOUTH', c.coach_class, COUNT(*), SUM(c.coach_capacity)
  FROM coach@ZONE_SOUTH c
 GROUP BY c.coach_class;

-- Federated catalogue: shared train/route/station reference data joined with
-- the zone-owned schedules. This is the exact query the find-trains API exposes
-- (cache-backed in Phase 6, Mongo snapshot in Phase 8).
CREATE OR REPLACE VIEW vw_train_catalog AS
SELECT t.train_id, t.train_no, t.train_name, t.train_type,
       r.route_id, r.origin_station, o.station_code AS origin_code, o.station_name AS origin_name,
       r.destination_station, d.station_code AS dest_code, d.station_name AS dest_name,
       s.schedule_id, s.zone_id, s.journey_date, s.departure_time, s.arrival_time, s.status
  FROM train t
  JOIN train_route tr ON tr.train_id = t.train_id AND tr.is_active = 1
  JOIN route r       ON r.route_id = tr.route_id
  JOIN station o     ON o.station_id = r.origin_station
  JOIN station d     ON d.station_id = r.destination_station
  JOIN vw_all_zone_schedules s ON s.train_id = t.train_id;

-- Federated coach view for the station-master / TTE consoles.
CREATE OR REPLACE VIEW vw_zone_coaches AS
SELECT 'NORTH' AS zone_name, c.coach_id, c.schedule_id, c.coach_no, c.coach_class,
       c.coach_capacity, c.class_quota
  FROM coach@ZONE_NORTH c
UNION ALL
SELECT 'WEST', c.coach_id, c.schedule_id, c.coach_no, c.coach_class,
       c.coach_capacity, c.class_quota
  FROM coach@ZONE_WEST c
UNION ALL
SELECT 'SOUTH', c.coach_id, c.schedule_id, c.coach_no, c.coach_class,
       c.coach_capacity, c.class_quota
  FROM coach@ZONE_SOUTH c;

WHENEVER SQLERROR EXIT
PROMPT Distributed views created