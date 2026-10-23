-- =============================================================================
-- RailNexus - 02_seed_data.sql
-- Deterministic reference seed: zones, stations, trains (all subtypes), routes,
-- station stops, fare rules, sample people and per-role employees, plus the
-- booking family (schedules, coaches, seats) generated for the next 21 days.
-- Runs as RAILNEXUS in the shared schema (Phase 1). Zone schemas receive their
-- own fragmentation seed (db/zone_common/zone_seed.sql) in Phase 2.
--
-- All train/station/person names are fictional.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

-- ---------------------------------------------------------------------------
-- 0. ORDERED CLEANUP (only matters if 02_seed runs against an existing schema;
-- the full reset path drops/recreates the schema via 00_bootstrap.sql).
-- Order matters: a child must be emptied before the parent it references.
-- ---------------------------------------------------------------------------
DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(30);
  v_names t_names := t_names(
    -- operational rows referencing schedules / people / stations
    'TTE_ASSIGNMENT','STATION_ANNOUNCEMENT',
    -- class policy (references schedule), then inventory (seat->coach->schedule)
    'SCHEDULE_CLASS_POLICY',
    -- tickets and queues (reference booking, schedule, seat, coach)
    'WAITLIST_QUEUE','WAITLISTED_TICKET','RAC_TICKET','CONFIRMED_TICKET','TICKET',
    -- payments / refunds / fare lines / audit (reference booking)
    'FARE_BREAKUP','REFUND','WALLET_PAYMENT','CARD_PAYMENT','UPI_PAYMENT','PAYMENT',
    'BOOKING_AUDIT','BOOKING',
    -- inventory (seat->coach->schedule)
    'SEAT_SEGMENT','SEAT','COACH',
    -- schedules (reference train, route, zone)
    'TRAIN_SCHEDULE',
    -- people: role rows -> employee/passenger -> person
    'SUPER_ADMIN','ZONE_ADMIN','STATION_MASTER','TTE_CONDUCTOR',
    'EMPLOYEE','PASSENGER','PERSON',
    -- reference data
    'FARE_RULE','TRAIN_ROUTE','STATION_ROUTE','ROUTE','TRAIN',
    'EXPRESS_TRAIN','SUPERFAST_TRAIN','PASSENGER_TRAIN','FREIGHT_TRAIN',
    'STATION','ZONE');
BEGIN
  FOR i IN 1 .. v_names.COUNT LOOP
    BEGIN EXECUTE IMMEDIATE 'DELETE FROM ' || v_names(i); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  COMMIT;
END;
/

-- ---------------------------------------------------------------------------
-- 1. ZONES
-- ---------------------------------------------------------------------------
INSERT INTO zone (zone_id, zone_code, zone_name, description) VALUES (1, 'NR', 'Northern Railway', 'North frontier division (shared schema federation point)');
INSERT INTO zone (zone_id, zone_code, zone_name, description) VALUES (2, 'WR', 'Western Railway', 'West coastal division');
INSERT INTO zone (zone_id, zone_code, zone_name, description) VALUES (3, 'SR', 'Southern Railway', 'South valleys division');

-- ---------------------------------------------------------------------------
-- 2. STATIONS (10 across the three zones)
-- ---------------------------------------------------------------------------
-- North (zone 1)
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (101, 1, 'NVLJ', 'Northvale Junction', 'Northvale', 8);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (102, 1, 'GRPK', 'Greenpeak', 'Greenpeak', 5);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (103, 1, 'RVSC', 'Riverside City', 'Riverside', 6);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (104, 1, 'KNGP', 'Kingspur', 'Kingspur', 4);
-- West (zone 2)
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (201, 2, 'WSTC', 'Westport Central', 'Westport', 9);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (202, 2, 'SDWC', 'Sandalwood City', 'Sandalwood', 6);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (203, 2, 'SNCS', 'Suncoast', 'Suncoast', 7);
-- South (zone 3)
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (301, 3, 'SBAY', 'Southbay City', 'Southbay', 8);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (302, 3, 'MCDK', 'Mercantile Docks', 'Mercantile', 6);
INSERT INTO station (station_id, zone_id, station_code, station_name, city, platform_count) VALUES (303, 3, 'TMHD', 'Tamarind Hill', 'Tamarind', 5);

-- ---------------------------------------------------------------------------
-- 3. TRAINS across all four subtypes
-- ---------------------------------------------------------------------------
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (1, 'E', '10001', 'City Rajdhani Express');
INSERT INTO express_train (train_id, pantry_service, top_speed_kmh) VALUES (1, 'Y', 160);
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (2, 'E', '10002', 'Twilight Express');
INSERT INTO express_train (train_id, pantry_service, top_speed_kmh) VALUES (2, 'Y', 150);
-- Superfast trains
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (3, 'S', '12001', 'Coastal Superfast');
INSERT INTO superfast_train (train_id, superfast_surcharge, premium_tatkal) VALUES (3, 45, 'Y');
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (4, 'S', '12002', 'Sirocco Superfast');
INSERT INTO superfast_train (train_id, superfast_surcharge, premium_tatkal) VALUES (4, 45, 'N');
-- Passenger trains
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (5, 'P', '13001', 'Ghat Passenger');
INSERT INTO passenger_train (train_id, stops_count, service_type) VALUES (5, 14, 'INTERCITY');
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (6, 'P', '13002', 'Market Local');
INSERT INTO passenger_train (train_id, stops_count, service_type) VALUES (6, 26, 'LOCAL');
-- Freight trains (never bookable as passenger seats)
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (7, 'F', '40001', 'Coal Hauler');
INSERT INTO freight_train (train_id, cargo_type, max_load_tonnes) VALUES (7, 'COAL', 3200);
INSERT INTO train (train_id, train_type, train_no, train_name) VALUES (8, 'F', '40002', 'Grain Runner');
INSERT INTO freight_train (train_id, cargo_type, max_load_tonnes) VALUES (8, 'GRAIN', 2800);

-- ---------------------------------------------------------------------------
-- 4. ROUTES, STATION_ROUTE stops and TRAIN_ROUTE mapping
-- ---------------------------------------------------------------------------
-- Route 1: Northvale -> Southbay (cross zone N->S), 4 intermediate stops
INSERT INTO route (route_id, route_code, origin_station, destination_station, direction, base_distance_km) VALUES (10, 'N-S-1', 101, 301, 'A', 980);
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (10, 101, 1, 0,    NULL, '18:30');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (10, 102, 2, 120,  '19:40', '19:45');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (10, 104, 3, 260,  '21:05', '21:10');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (10, 203, 4, 610,  '01:50', '02:10');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (10, 302, 5, 820,  '04:40', '04:50');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (10, 301, 6, 980,  '06:10', NULL);

-- Route 2: Westport -> Tamarind (cross zone W->S)
INSERT INTO route (route_id, route_code, origin_station, destination_station, direction, base_distance_km) VALUES (11, 'W-S-2', 201, 303, 'A', 720);
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (11, 201, 1, 0,   NULL, '09:00');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (11, 202, 2, 180, '10:30', '10:35');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (11, 302, 3, 560, '13:20', '13:30');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (11, 303, 4, 720, '15:10', NULL);

-- Route 3: Suncoast -> Riverside (cross zone W->N)
INSERT INTO route (route_id, route_code, origin_station, destination_station, direction, base_distance_km) VALUES (12, 'W-N-3', 203, 103, 'A', 890);
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (12, 203, 1, 0,  NULL, '07:00');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (12, 201, 2, 240, '09:00', '09:05');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (12, 104, 3, 600, '12:30', '12:35');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (12, 103, 4, 890, '15:30', NULL);

-- Route 4: Greenpeak -> Mercantile (cross zone N->S)
INSERT INTO route (route_id, route_code, origin_station, destination_station, direction, base_distance_km) VALUES (13, 'N-S-4', 102, 302, 'A', 760);
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (13, 102, 1, 0, NULL, '06:30');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (13, 103, 2, 210, '08:10', '08:20');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (13, 303, 3, 520, '11:00', '11:10');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (13, 302, 4, 760, '13:20', NULL);

-- Route 5: Westport -> Sandalwood (intra-west passenger train)
INSERT INTO route (route_id, route_code, origin_station, destination_station, direction, base_distance_km) VALUES (14, 'W-5', 201, 202, 'A', 180);
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (14, 201, 1, 0, NULL, '05:30');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (14, 202, 2, 180, '06:50', NULL);

-- Route 6: Southbay -> Tamarind (intra-south passenger train)
INSERT INTO route (route_id, route_code, origin_station, destination_station, direction, base_distance_km) VALUES (15, 'S-6', 301, 303, 'A', 210);
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (15, 301, 1, 0, NULL, '16:00');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (15, 302, 2, 130, '17:05', '17:10');
INSERT INTO station_route (route_id, station_id, stop_order, km_from_origin, arrival, departure) VALUES (15, 303, 3, 210, '18:20', NULL);

-- Train -> route mapping (each demo train runs one route).
INSERT INTO train_route (train_id, route_id, is_active) VALUES (1, 10, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (2, 11, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (3, 12, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (4, 13, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (5, 14, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (6, 15, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (7, 13, 1);
INSERT INTO train_route (train_id, route_id, is_active) VALUES (8, 11, 1);

-- ---------------------------------------------------------------------------
-- 5. FARE RULES (base rates; JSON rule documents land in Phase 5)
-- ---------------------------------------------------------------------------
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (1, 'E', '1A', 3.00, 1200, 12000);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (2, 'E', '2A', 1.90, 600, 7000);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (3, 'E', '3A', 1.35, 350, 5000);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (4, 'E', 'SL', 0.85, 120, 2500);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (5, 'S', '1A', 3.30, 1300, 13000);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (6, 'S', '2A', 2.10, 650, 7500);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (7, 'S', '3A', 1.50, 380, 5500);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (8, 'S', 'SL', 0.95, 140, 2700);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (9, 'P', 'SL', 0.60, 50, 900);
INSERT INTO fare_rule (rule_id, train_type, coach_class, base_rate_per_km, min_fare, max_fare)
  VALUES (10, 'P', '2S', 0.55, 40, 700);

-- ---------------------------------------------------------------------------
-- 6. PEOPLE: 10 passengers + 5 employees (one per role)
-- Demo password for every sample account is:  Demo@123
-- Documented demo logins (see README):
--   passenger@railnexus.local  (1001, passenger)
--   tte@railnexus.local        (2001, tte)
--   station@railnexus.local    (2002, station_master)
--   zoneadmin@railnexus.local  (2003, zone_admin)
--   admin@railnexus.local      (2005, super_admin)
-- bcrypt (cost 12) hash: $2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e
-- ---------------------------------------------------------------------------
-- Passengers (ids 1001..1010)
INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1001, 'P', 'Aarav Sharma', DATE '1996-04-12', 'M', 'passenger@railnexus.local', '+91-90000-00001', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1001, 'PAN', 'AAAAA1234A', '+91-91234-00001');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1002, 'P', 'Meera Nair', DATE '1993-11-02', 'F', 'meera.demo@railnexus.dev', '+91-90000-00002', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1002, 'PASSPORT', 'K8765432', '+91-91234-00002');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1003, 'P', 'Rohan Gupta', DATE '1990-07-21', 'M', 'rohan.demo@railnexus.dev', '+91-90000-00003', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1003, 'AADHAAR', '111122223333', '+91-91234-00003');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1004, 'P', 'Priya Patil', DATE '1998-01-30', 'F', 'priya.demo@railnexus.dev', '+91-90000-00004', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1004, 'PAN', 'BBBBB4567B', '+91-91234-00004');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1005, 'P', 'Kabir Ansari', DATE '1988-09-15', 'M', 'kabir.demo@railnexus.dev', '+91-90000-00005', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1005, 'DRIVING', 'DL4321XXX', '+91-91234-00005');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1006, 'P', 'Sana Shaikh', DATE '1995-06-25', 'F', 'sana.demo@railnexus.dev', '+91-90000-00006', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1006, 'AADHAAR', '444455556666', '+91-91234-00006');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1007, 'P', 'Dev Prakash', DATE '1991-12-08', 'M', 'dev.demo@railnexus.dev', '+91-90000-00007', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1007, 'PAN', 'CCCCC7890C', '+91-91234-00007');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1008, 'P', 'Aisha Khan', DATE '1999-03-17', 'F', 'aisha.demo@railnexus.dev', '+91-90000-00008', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1008, 'AADHAAR', '777788889999', '+91-91234-00008');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1009, 'P', 'Vikram Rathore', DATE '1985-05-01', 'M', 'vikram.demo@railnexus.dev', '+91-90000-00009', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1009, 'DRIVING', 'DL9999XXX', '+91-91234-00009');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (1010, 'P', 'Nandini Rao', DATE '1997-10-29', 'F', 'nandini.demo@railnexus.dev', '+91-90000-00010', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO passenger (person_id, id_document_type, id_document_number, emergency_phone) VALUES (1010, 'PASSPORT', 'T1122334', '+91-91234-00010');

-- Employees (ids 2001..2005): one TTE, one station master, two zone admins, one super admin
INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (2001, 'E', 'Tarak Tiwari', DATE '1987-02-14', 'M', 'tte@railnexus.local', '+91-80000-00001', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO employee (person_id, employee_no, hire_date, designation, base_station_id) VALUES (2001, 'EMP-1001', DATE '2012-06-01', 'Senior TTE', 102);
INSERT INTO tte_conductor (employee_id, staff_id, zone_id, shift) VALUES (2001, 'TTE-N-101', 1, 'DAY');

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (2002, 'E', 'Shivani Singh', DATE '1990-08-08', 'F', 'station@railnexus.local', '+91-80000-00002', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO employee (person_id, employee_no, hire_date, designation, base_station_id) VALUES (2002, 'EMP-1002', DATE '2014-01-20', 'Station Master', 103);
INSERT INTO station_master (employee_id, station_id, zone_id) VALUES (2002, 103, 1);

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (2003, 'E', 'Arjun Malhotra', DATE '1984-03-03', 'M', 'zoneadmin@railnexus.local', '+91-80000-00003', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO employee (person_id, employee_no, hire_date, designation, base_station_id) VALUES (2003, 'EMP-1003', DATE '2010-11-11', 'Zonal Manager North', 101);
INSERT INTO zone_admin (employee_id, zone_id) VALUES (2003, 1);

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (2004, 'E', 'Feroz Contractor', DATE '1986-12-12', 'M', 'wz.admin@railnexus.dev', '+91-80000-00004', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO employee (person_id, employee_no, hire_date, designation, base_station_id) VALUES (2004, 'EMP-1004', DATE '2011-05-05', 'Zonal Manager West', 201);
INSERT INTO zone_admin (employee_id, zone_id) VALUES (2004, 2);

INSERT INTO person (person_id, person_type, full_name, date_of_birth, gender, email, phone, password_hash)
VALUES (2005, 'E', 'Ira Deshpande', DATE '1980-07-07', 'F', 'admin@railnexus.local', '+91-80000-00005', '$2a$12$AMz.2JIl7KyKbXVJNd6NGexGYon/0FtCDP6iRscOpTKKPZHDFTT8e');
INSERT INTO employee (person_id, employee_no, hire_date, designation, base_station_id) VALUES (2005, 'EMP-1005', DATE '2008-09-09', 'Super Admin', 201);
INSERT INTO super_admin (employee_id, panel_access) VALUES (2005, 'ALL');

-- ---------------------------------------------------------------------------
-- 7. SCHEDULES, COACHES, SEATS for the next 21 days
-- Zone of a schedule = zone of its origin station. Freight trains get schedule
-- rows but NO coaches/seats and are never offered for passenger booking.
-- ---------------------------------------------------------------------------

-- Seed helper: deterministic coach + seat generation for one schedule + class.
-- Lives in db/zone_common so the identical generator runs in every zone schema.
@@../zone_common/seed_helper.sql

DECLARE
  CURSOR c_trains IS
    SELECT t.train_id, t.train_type, tr.route_id, st.zone_id
      FROM train t
      JOIN train_route tr ON tr.train_id = t.train_id AND tr.is_active = 1
      JOIN route  r ON r.route_id = tr.route_id
      JOIN station st ON st.station_id = r.origin_station
     WHERE t.active = 1;
  v_schedule_id NUMBER;
BEGIN
  FOR rec IN c_trains LOOP
    -- Every train runs every day over its single route for the demo horizon.
    FOR d IN 0 .. 20 LOOP
      INSERT INTO train_schedule (schedule_id, train_id, route_id, zone_id, journey_date, departure_time, arrival_time)
      VALUES (seq_schedule.NEXTVAL, rec.train_id, rec.route_id, rec.zone_id,
              TRUNC(SYSDATE) + d,
              TRUNC(SYSDATE) + d + 18/24 + MOD(rec.train_id, 3)/24,
              TRUNC(SYSDATE) + d + 27/24 + MOD(rec.train_id, 2)/24)
      RETURNING schedule_id INTO v_schedule_id;

      -- Only passenger-carrying subtypes get coaches and seats.
      IF rec.train_type IN ('E','S','P') THEN
        IF rec.train_type = 'P' THEN
          seed_schedule_coaches(v_schedule_id, '2S', 1, 2, 1);
        ELSE
          seed_schedule_coaches(v_schedule_id, 'SL', 1, 2, 1);
          seed_schedule_coaches(v_schedule_id, '3A', 1, 2, 1);
          seed_schedule_coaches(v_schedule_id, '2A', 1, 2, 1);
          seed_schedule_coaches(v_schedule_id, '1A', 1, 2, 1);
        END IF;
      END IF;
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('seeded schedules for train ' || rec.train_id);
  END LOOP;
  COMMIT;
END;
/

-- ---------------------------------------------------------------------------
-- 8. TTE duty assignments for the demo TTE on the next journey of each route.
-- ---------------------------------------------------------------------------
DECLARE
  CURSOR c_duty IS
    SELECT s.schedule_id, s.journey_date
      FROM train_schedule s
      JOIN train t ON t.train_id = s.train_id AND t.train_type IN ('E','S','P')
      JOIN route r ON r.route_id = s.route_id
     WHERE s.journey_date = (SELECT MIN(journey_date) FROM train_schedule WHERE train_id = s.train_id);
BEGIN
  FOR rec IN c_duty LOOP
    BEGIN
      INSERT INTO tte_assignment (assignment_id, employee_id, schedule_id, duty_from, duty_to, status)
      VALUES (seq_tte_assignment.NEXTVAL, 2001, rec.schedule_id, rec.journey_date + 17/24, rec.journey_date + 28/24, 'ACTIVE');
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
    END;
  END LOOP;
  COMMIT;
END;
/

WHENEVER SQLERROR EXIT
PROMPT Seed data loaded