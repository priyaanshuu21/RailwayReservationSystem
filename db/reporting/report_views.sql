-- =============================================================================
-- RailNexus - Phase 10: reporting / OLAP views.
-- Read-only analytical objects over the shared schema (the mirror schema also
-- holds the booking family so reports see the whole federation without crossing
-- database links). One object is materialized (mv_revenue_by_train) to model the
-- OLTP-vs-OLAP separation; refresh via pkg_reporting.refresh_materialized.
-- Re-runnable: views are CREATE OR REPLACE; the MV is dropped defensively first.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE VIEW vw_revenue_daily AS
SELECT TRUNC(p.processed_at)      AS revenue_date,
       COUNT(DISTINCT p.booking_id) AS booking_count,
       SUM(p.amount)              AS revenue_total
  FROM payment p
 WHERE p.status = 'CAP' AND p.processed_at IS NOT NULL
 GROUP BY TRUNC(p.processed_at);

CREATE OR REPLACE VIEW vw_zone_summary AS
SELECT z.zone_id,
       z.zone_code,
       z.zone_name,
       COUNT(DISTINCT b.booking_id) AS booking_count,
       NVL(SUM(b.fare_total), 0)    AS gross_fare,
       COUNT(DISTINCT CASE WHEN t.status = 'CFM' THEN t.ticket_id END) AS confirmed_tickets,
       COUNT(DISTINCT CASE WHEN t.status = 'WL' THEN t.ticket_id END)  AS waitlisted_tickets
  FROM zone z
  LEFT JOIN train_schedule s ON s.zone_id = z.zone_id
  LEFT JOIN booking b ON b.schedule_id = s.schedule_id
  LEFT JOIN ticket t ON t.booking_id = b.booking_id
 GROUP BY z.zone_id, z.zone_code, z.zone_name;

CREATE OR REPLACE VIEW vw_occupancy_by_schedule AS
SELECT c.schedule_id,
       c.coach_class,
       COUNT(*)                                          AS seat_count,
       SUM(CASE WHEN s.status = 'R' THEN 1 ELSE 0 END)   AS occupied_seats,
       ROUND(100 * SUM(CASE WHEN s.status = 'R' THEN 1 ELSE 0 END) / COUNT(*), 2) AS occupancy_pct
  FROM coach c JOIN seat s ON s.coach_id = c.coach_id
 GROUP BY c.schedule_id, c.coach_class;

CREATE OR REPLACE VIEW vw_waitlist_pressure AS
SELECT schedule_id,
       coach_class,
       SUM(CASE WHEN queue_type = 'RAC' THEN 1 ELSE 0 END) AS rac_count,
       SUM(CASE WHEN queue_type = 'WL' THEN 1 ELSE 0 END)  AS wl_count
  FROM waitlist_queue
 GROUP BY schedule_id, coach_class;

CREATE OR REPLACE VIEW vw_route_popularity AS
SELECT r.route_id,
       COUNT(DISTINCT b.booking_id) AS booking_count,
       NVL(SUM(b.fare_total), 0)    AS revenue
  FROM route r
  LEFT JOIN train_schedule s ON s.route_id = r.route_id
  LEFT JOIN booking b ON b.schedule_id = s.schedule_id
 GROUP BY r.route_id;

-- Defensive drop so the script is re-runnable on 11g-23ai (no IF EXISTS DDL).
BEGIN
  EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW mv_revenue_by_train';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE NOT IN (-12003, -942) THEN RAISE; END IF;
END;
/

CREATE MATERIALIZED VIEW mv_revenue_by_train
  REFRESH COMPLETE ON DEMAND
AS
SELECT t.train_id,
       t.train_no,
       t.train_name,
       COUNT(DISTINCT b.booking_id) AS booking_count,
       NVL(SUM(b.fare_total), 0)    AS revenue
  FROM train t
  LEFT JOIN train_schedule s ON s.train_id = t.train_id
  LEFT JOIN booking b ON b.schedule_id = s.schedule_id
 GROUP BY t.train_id, t.train_no, t.train_name;
