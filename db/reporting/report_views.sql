WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
CREATE OR REPLACE VIEW vw_live_bookings AS
SELECT 'NR' AS zone_code,b.*,s.zone_id,s.route_id,s.train_id FROM booking@ZONE_NORTH b JOIN train_schedule@ZONE_NORTH s ON s.schedule_id=b.schedule_id
UNION ALL
SELECT 'WR' AS zone_code,b.*,s.zone_id,s.route_id,s.train_id FROM booking@ZONE_WEST b JOIN train_schedule@ZONE_WEST s ON s.schedule_id=b.schedule_id
UNION ALL
SELECT 'SR' AS zone_code,b.*,s.zone_id,s.route_id,s.train_id FROM booking@ZONE_SOUTH b JOIN train_schedule@ZONE_SOUTH s ON s.schedule_id=b.schedule_id;
CREATE OR REPLACE VIEW vw_live_payments AS
SELECT 'NR' AS zone_code,p.*,s.zone_id FROM payment@ZONE_NORTH p JOIN booking@ZONE_NORTH b ON b.booking_id=p.booking_id JOIN train_schedule@ZONE_NORTH s ON s.schedule_id=b.schedule_id
UNION ALL
SELECT 'WR' AS zone_code,p.*,s.zone_id FROM payment@ZONE_WEST p JOIN booking@ZONE_WEST b ON b.booking_id=p.booking_id JOIN train_schedule@ZONE_WEST s ON s.schedule_id=b.schedule_id
UNION ALL
SELECT 'SR' AS zone_code,p.*,s.zone_id FROM payment@ZONE_SOUTH p JOIN booking@ZONE_SOUTH b ON b.booking_id=p.booking_id JOIN train_schedule@ZONE_SOUTH s ON s.schedule_id=b.schedule_id;
CREATE OR REPLACE VIEW vw_live_tickets AS
SELECT 'NR' AS zone_code,a.* FROM ticket@ZONE_NORTH a
UNION ALL
SELECT 'WR' AS zone_code,a.* FROM ticket@ZONE_WEST a
UNION ALL
SELECT 'SR' AS zone_code,a.* FROM ticket@ZONE_SOUTH a;
CREATE OR REPLACE VIEW vw_live_audit AS
SELECT 'NR' AS zone_code,a.audit_id,a.booking_id,a.event_type,a.event_time FROM booking_audit@ZONE_NORTH a
UNION ALL
SELECT 'WR' AS zone_code,a.audit_id,a.booking_id,a.event_type,a.event_time FROM booking_audit@ZONE_WEST a
UNION ALL
SELECT 'SR' AS zone_code,a.audit_id,a.booking_id,a.event_type,a.event_time FROM booking_audit@ZONE_SOUTH a;
CREATE OR REPLACE VIEW vw_live_outbox AS
SELECT 'NR' AS zone_code,a.event_id,a.event_type,a.aggregate_id,a.status,a.created_at FROM domain_outbox@ZONE_NORTH a
UNION ALL
SELECT 'WR' AS zone_code,a.event_id,a.event_type,a.aggregate_id,a.status,a.created_at FROM domain_outbox@ZONE_WEST a
UNION ALL
SELECT 'SR' AS zone_code,a.event_id,a.event_type,a.aggregate_id,a.status,a.created_at FROM domain_outbox@ZONE_SOUTH a;
CREATE OR REPLACE VIEW vw_live_waitlist AS
SELECT 'NR' AS zone_code,a.* FROM waitlist_queue@ZONE_NORTH a
UNION ALL
SELECT 'WR' AS zone_code,a.* FROM waitlist_queue@ZONE_WEST a
UNION ALL
SELECT 'SR' AS zone_code,a.* FROM waitlist_queue@ZONE_SOUTH a;
-- Aggregate at each remote zone before combining: avoid shipping booking/seat rows
-- across database links for every dashboard request.
CREATE OR REPLACE VIEW vw_revenue_daily AS
SELECT 1 AS zone_id,TRUNC(processed_at) AS revenue_date,COUNT(*) AS booking_count,SUM(amount) AS revenue_total
FROM payment@ZONE_NORTH WHERE status='CAP' GROUP BY TRUNC(processed_at)
UNION ALL
SELECT 2 AS zone_id,TRUNC(processed_at) AS revenue_date,COUNT(*) AS booking_count,SUM(amount) AS revenue_total
FROM payment@ZONE_WEST WHERE status='CAP' GROUP BY TRUNC(processed_at)
UNION ALL
SELECT 3 AS zone_id,TRUNC(processed_at) AS revenue_date,COUNT(*) AS booking_count,SUM(amount) AS revenue_total
FROM payment@ZONE_SOUTH WHERE status='CAP' GROUP BY TRUNC(processed_at);
CREATE OR REPLACE VIEW vw_zone_summary AS
SELECT z.zone_id,z.zone_code,z.zone_name,a.booking_count,a.gross_fare,a.confirmed_tickets,a.waitlisted_tickets
FROM zone z JOIN (
SELECT 1 AS zone_id,COUNT(b.booking_id) AS booking_count,
 NVL(SUM(CASE WHEN b.status='BOK' THEN b.fare_total ELSE 0 END),0) AS gross_fare,
 COUNT(CASE WHEN t.status='CFM' THEN 1 END) AS confirmed_tickets,
 COUNT(CASE WHEN t.status='WL' THEN 1 END) AS waitlisted_tickets
FROM booking@ZONE_NORTH b LEFT JOIN ticket@ZONE_NORTH t ON t.booking_id=b.booking_id
UNION ALL
SELECT 2 AS zone_id,COUNT(b.booking_id) AS booking_count,
 NVL(SUM(CASE WHEN b.status='BOK' THEN b.fare_total ELSE 0 END),0) AS gross_fare,
 COUNT(CASE WHEN t.status='CFM' THEN 1 END) AS confirmed_tickets,
 COUNT(CASE WHEN t.status='WL' THEN 1 END) AS waitlisted_tickets
FROM booking@ZONE_WEST b LEFT JOIN ticket@ZONE_WEST t ON t.booking_id=b.booking_id
UNION ALL
SELECT 3 AS zone_id,COUNT(b.booking_id) AS booking_count,
 NVL(SUM(CASE WHEN b.status='BOK' THEN b.fare_total ELSE 0 END),0) AS gross_fare,
 COUNT(CASE WHEN t.status='CFM' THEN 1 END) AS confirmed_tickets,
 COUNT(CASE WHEN t.status='WL' THEN 1 END) AS waitlisted_tickets
FROM booking@ZONE_SOUTH b LEFT JOIN ticket@ZONE_SOUTH t ON t.booking_id=b.booking_id) a ON a.zone_id=z.zone_id;
CREATE OR REPLACE VIEW vw_occupancy_by_schedule AS
SELECT 1 AS zone_id,c.schedule_id,c.coach_class,COUNT(*) AS seat_count,
 SUM(CASE WHEN s.status='R' THEN 1 ELSE 0 END) AS occupied_seats,
 ROUND(100*SUM(CASE WHEN s.status='R' THEN 1 ELSE 0 END)/COUNT(*),2) AS occupancy_pct
 FROM coach@ZONE_NORTH c JOIN seat@ZONE_NORTH s ON s.coach_id=c.coach_id GROUP BY c.schedule_id,c.coach_class
UNION ALL
SELECT 2 AS zone_id,c.schedule_id,c.coach_class,COUNT(*) AS seat_count,
 SUM(CASE WHEN s.status='R' THEN 1 ELSE 0 END) AS occupied_seats,
 ROUND(100*SUM(CASE WHEN s.status='R' THEN 1 ELSE 0 END)/COUNT(*),2) AS occupancy_pct
 FROM coach@ZONE_WEST c JOIN seat@ZONE_WEST s ON s.coach_id=c.coach_id GROUP BY c.schedule_id,c.coach_class
UNION ALL
SELECT 3 AS zone_id,c.schedule_id,c.coach_class,COUNT(*) AS seat_count,
 SUM(CASE WHEN s.status='R' THEN 1 ELSE 0 END) AS occupied_seats,
 ROUND(100*SUM(CASE WHEN s.status='R' THEN 1 ELSE 0 END)/COUNT(*),2) AS occupancy_pct
 FROM coach@ZONE_SOUTH c JOIN seat@ZONE_SOUTH s ON s.coach_id=c.coach_id GROUP BY c.schedule_id,c.coach_class;
CREATE OR REPLACE VIEW vw_waitlist_pressure AS
SELECT zone_code,schedule_id,coach_class,SUM(CASE WHEN queue_type='RAC' THEN 1 ELSE 0 END) AS rac_count,
 SUM(CASE WHEN queue_type='WL' THEN 1 ELSE 0 END) AS wl_count
FROM vw_live_waitlist GROUP BY zone_code,schedule_id,coach_class;
CREATE OR REPLACE VIEW vw_route_popularity AS
SELECT route_id,COUNT(*) AS booking_count,SUM(fare_total) AS revenue FROM vw_live_bookings WHERE status='BOK' GROUP BY route_id;
BEGIN
 EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW mv_revenue_by_train';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-12003,-942) THEN RAISE; END IF;
END;
/
CREATE MATERIALIZED VIEW mv_revenue_by_train REFRESH COMPLETE ON DEMAND AS
SELECT t.train_id,t.train_no,t.train_name,COUNT(b.booking_id) AS booking_count,NVL(SUM(b.fare_total),0) AS revenue
FROM train t LEFT JOIN vw_live_bookings b ON b.train_id=t.train_id AND b.status='BOK'
GROUP BY t.train_id,t.train_no,t.train_name;
