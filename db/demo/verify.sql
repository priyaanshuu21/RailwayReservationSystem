SET PAGESIZE 100 LINESIZE 200
-- Shared RAILNEXUS connection. These queries do not change data.
SELECT TO_CHAR(s.journey_date,'YYYY-MM-DD') journey_date,COUNT(*) passenger_trains
FROM train_schedule s JOIN train t ON t.train_id=s.train_id
WHERE s.journey_date BETWEEN DATE '2026-10-01' AND DATE '2026-10-30' AND t.train_type<>'F'
GROUP BY s.journey_date ORDER BY s.journey_date;
SELECT * FROM vw_zone_summary ORDER BY zone_id;
SELECT zone_code,booking_id,event_type,event_time FROM vw_live_audit
WHERE event_type IN ('TICKET_CANCELLED','TICKET_PROMOTED') ORDER BY event_time DESC FETCH FIRST 20 ROWS ONLY;
SELECT zone_code,COUNT(*) outbox_events FROM vw_live_outbox GROUP BY zone_code;
SELECT zone_code,schedule_id,coach_class,queue_type,position,ticket_id FROM vw_live_waitlist ORDER BY zone_code,schedule_id,position;
SELECT t.pnr,t.status,b.request_id,ct.seat_id,ct.berth FROM ticket@ZONE_NORTH t
JOIN booking@ZONE_NORTH b ON b.booking_id=t.booking_id
LEFT JOIN confirmed_ticket@ZONE_NORTH ct ON ct.ticket_id=t.ticket_id
WHERE b.request_id LIKE 'OCT26-WL-%' ORDER BY b.request_id;
SELECT r.refund_id,r.amount,r.status,b.booking_id,t.pnr FROM refund@ZONE_NORTH r
JOIN payment@ZONE_NORTH p ON p.payment_id=r.payment_id JOIN booking@ZONE_NORTH b ON b.booking_id=p.booking_id
JOIN ticket@ZONE_NORTH t ON t.booking_id=b.booking_id ORDER BY r.created_at DESC FETCH FIRST 10 ROWS ONLY;
SELECT announcement_id,event_type,actor_id,event_time FROM announcement_audit ORDER BY event_time DESC;
SELECT train_no,booking_count,revenue FROM mv_revenue_by_train ORDER BY train_no;
