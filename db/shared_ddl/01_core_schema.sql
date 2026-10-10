-- =============================================================================
-- RailNexus - 01_core_schema.sql
-- Shared (federation/reference) EER schema, table-per-subtype pattern.
-- Requires Oracle 11.2 or later; does NOT require edition-specific features
-- (partitioning and JSON columns are added separately, version-guarded).
-- Runs as user RAILNEXUS (see 00_bootstrap.sql). Re-runnable because the
-- schema is owned by a dedicated user that 00_bootstrap.sql rebuilds.
--
-- Design highlights
--  * SUPER/PERSON -> PASSENGER, EMPLOYEE; EMPLOYEE -> TTE/STATION_MASTER/
--    ZONE_ADMIN/SUPER_ADMIN with discriminator + FK-as-PK and a trigger that
--    enforces disjointness.
--  * TRAIN -> EXPRESS/SUPERFAST/PASSENGER/FREIGHT (disjoint, total).
--  * The booking family (SCHEDULE/COACH/SEAT/BOOKING/TICKET/PAYMENT/...) is
--    included from ../zone_common/booking_family.sql so the exact same DDL is
--    also deployed into each zone schema (horizontal fragmentation).
--  * PKs are sequence-based for maximum dialect compatibility; where an
--    edition supports IDENTITY/identity columns this remains unchanged, so
--    one DDL file runs on 11g through 23ai.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ZONE / STATION reference data
-- ---------------------------------------------------------------------------
CREATE TABLE zone (
  zone_id      NUMBER(6)      NOT NULL,
  zone_code    VARCHAR2(4)    NOT NULL,
  zone_name    VARCHAR2(60)   NOT NULL,
  description  VARCHAR2(200),
  CONSTRAINT pk_zone PRIMARY KEY (zone_id),
  CONSTRAINT uq_zone_code UNIQUE (zone_code)
);

CREATE SEQUENCE seq_zone START WITH 1;

CREATE OR REPLACE TRIGGER trg_zone_bi
BEFORE INSERT ON zone FOR EACH ROW
WHEN (NEW.zone_id IS NULL)
BEGIN
  :NEW.zone_id := seq_zone.NEXTVAL;
END;
/

CREATE TABLE station (
  station_id      NUMBER(10)   NOT NULL,
  zone_id         NUMBER(6)    NOT NULL,
  station_code    VARCHAR2(10) NOT NULL,
  station_name    VARCHAR2(80) NOT NULL,
  city            VARCHAR2(60),
  platform_count  NUMBER(3)    DEFAULT 4,
  pincode         VARCHAR2(10),
  CONSTRAINT pk_station PRIMARY KEY (station_id),
  CONSTRAINT uq_station_code UNIQUE (station_code),
  CONSTRAINT fk_station_zone FOREIGN KEY (zone_id) REFERENCES zone(zone_id)
);
-- B-tree on FK back to ZONE.
CREATE INDEX idx_station_zone ON station(zone_id);

CREATE SEQUENCE seq_station START WITH 1;

CREATE OR REPLACE TRIGGER trg_station_bi
BEFORE INSERT ON station FOR EACH ROW
WHEN (NEW.station_id IS NULL)
BEGIN
  :NEW.station_id := seq_station.NEXTVAL;
END;
/

-- ---------------------------------------------------------------------------
-- PERSON specialization hierarchy
-- ---------------------------------------------------------------------------
CREATE TABLE person (
  person_id      NUMBER(10)      NOT NULL,
  person_type    CHAR(1)         NOT NULL
                   CONSTRAINT ck_person_type CHECK (person_type IN ('P','E')),
  full_name      VARCHAR2(100)   NOT NULL,
  date_of_birth  DATE,
  gender         CHAR(1)         CONSTRAINT ck_person_gender CHECK (gender IN ('M','F','O')),
  email          VARCHAR2(120)   NOT NULL,
  phone          VARCHAR2(20)    NOT NULL,
  password_hash  VARCHAR2(100),
  login_enabled  NUMBER(1)       DEFAULT 1 NOT NULL
                   CONSTRAINT ck_person_login CHECK (login_enabled IN (0,1)),
  created_at     TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_person PRIMARY KEY (person_id),
  CONSTRAINT uq_person_email UNIQUE (email),
  CONSTRAINT uq_person_phone UNIQUE (phone)
);

CREATE SEQUENCE seq_person START WITH 1;

CREATE OR REPLACE TRIGGER trg_person_bi
BEFORE INSERT ON person FOR EACH ROW
WHEN (NEW.person_id IS NULL)
BEGIN
  :NEW.person_id := seq_person.NEXTVAL;
END;
/

-- PASSENGER: total participation for person_type = 'P', enforced by
-- trg_passenger_disjoint below (checks discriminator + sibling absence).
CREATE TABLE passenger (
  person_id             NUMBER(10)  NOT NULL,
  id_document_type      VARCHAR2(20) NOT NULL,
  id_document_number    VARCHAR2(40) NOT NULL,
  emergency_phone       VARCHAR2(20),
  notification_pref     VARCHAR2(10) DEFAULT 'SMS',
  CONSTRAINT pk_passenger PRIMARY KEY (person_id),
  CONSTRAINT fk_passenger_person FOREIGN KEY (person_id) REFERENCES person(person_id),
  CONSTRAINT uq_passenger_doc UNIQUE (id_document_type, id_document_number)
);

CREATE TABLE employee (
  person_id       NUMBER(10)   NOT NULL,
  employee_no     VARCHAR2(20) NOT NULL,
  hire_date       DATE         NOT NULL,
  designation     VARCHAR2(80),
  base_station_id NUMBER(10)   NOT NULL,
  CONSTRAINT pk_employee PRIMARY KEY (person_id),
  CONSTRAINT uq_employee_no UNIQUE (employee_no),
  CONSTRAINT fk_employee_person FOREIGN KEY (person_id) REFERENCES person(person_id),
  CONSTRAINT fk_employee_station FOREIGN KEY (base_station_id) REFERENCES station(station_id)
);

CREATE TABLE tte_conductor (
  employee_id NUMBER(10)  NOT NULL,
  staff_id    VARCHAR2(20) NOT NULL,
  zone_id     NUMBER(6)   NOT NULL,
  shift       VARCHAR2(10) DEFAULT 'DAY',
  CONSTRAINT pk_tte PRIMARY KEY (employee_id),
  CONSTRAINT fk_tte_emp FOREIGN KEY (employee_id) REFERENCES employee(person_id),
  CONSTRAINT fk_tte_zone FOREIGN KEY (zone_id) REFERENCES zone(zone_id)
);

CREATE TABLE station_master (
  employee_id NUMBER(10) NOT NULL,
  station_id  NUMBER(10) NOT NULL,
  zone_id     NUMBER(6)  NOT NULL,
  CONSTRAINT pk_station_master PRIMARY KEY (employee_id),
  CONSTRAINT fk_station_master_emp FOREIGN KEY (employee_id) REFERENCES employee(person_id),
  CONSTRAINT fk_station_master_st FOREIGN KEY (station_id) REFERENCES station(station_id),
  CONSTRAINT fk_station_master_zone FOREIGN KEY (zone_id) REFERENCES zone(zone_id)
);

CREATE TABLE zone_admin (
  employee_id NUMBER(10) NOT NULL,
  zone_id     NUMBER(6)  NOT NULL,
  CONSTRAINT pk_zone_admin PRIMARY KEY (employee_id),
  CONSTRAINT fk_zone_admin_emp FOREIGN KEY (employee_id) REFERENCES employee(person_id),
  CONSTRAINT fk_zone_admin_zone FOREIGN KEY (zone_id) REFERENCES zone(zone_id)
);

-- SUPER_ADMIN is an added subtype beyond the three required roles so the
-- cross-zone operator account exists with least privilege instead of
-- overloading ZONE_ADMIN with a NULL zone. Documented in decisions.md.
CREATE TABLE super_admin (
  employee_id NUMBER(10) NOT NULL,
  panel_access VARCHAR2(200),
  CONSTRAINT pk_super_admin PRIMARY KEY (employee_id),
  CONSTRAINT fk_super_admin_emp FOREIGN KEY (employee_id) REFERENCES employee(person_id)
);

-- ---------------------------------------------------------------------------
-- Disjointness enforcement for the PERSON hierarchy.
--
-- A row can never live in two sibling subtype relations, and every subtype
-- must match its supertype discriminator. Why a trigger instead of a CHECK?
-- A CHECK can only see columns of one row; the "is the twin missing?" test
-- needs the sibling tables, so a small BEFORE INSERT row trigger is the
-- natural enforcement point. (Alternative, commented: denormalize
-- person_type onto the subtype tables and use FK(person_type, person_id)
-- against PERSON(person_type, person_id). That requires fiction about which
-- subtype is being inserted and is harder to audit.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_passenger_disjoint
BEFORE INSERT OR UPDATE ON passenger FOR EACH ROW
DECLARE
  v_type  CHAR(1);
  v_cnt   NUMBER;
BEGIN
  SELECT person_type INTO v_type FROM person WHERE person_id = :NEW.person_id;
  IF v_type <> 'P' THEN
    RAISE_APPLICATION_ERROR(-20001, 'person must be a PASSENGER to insert a passenger row');
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM employee WHERE person_id = :NEW.person_id;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20002, 'person already exists as an EMPLOYEE (disjoint)');
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20003, 'person supertype row must be inserted first (total participation)');
END;
/

CREATE OR REPLACE TRIGGER trg_employee_disjoint
BEFORE INSERT OR UPDATE ON employee FOR EACH ROW
DECLARE
  v_type  CHAR(1);
  v_cnt   NUMBER;
BEGIN
  SELECT person_type INTO v_type FROM person WHERE person_id = :NEW.person_id;
  IF v_type <> 'E' THEN
    RAISE_APPLICATION_ERROR(-20011, 'person must be an EMPLOYEE to insert an employee row');
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM passenger WHERE person_id = :NEW.person_id;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20012, 'person already exists as a PASSENGER (disjoint)');
  END IF;
END;
/

-- Employee role subtypes are also disjoint (one role per employee).
CREATE OR REPLACE TRIGGER trg_tte_role_disjoint
BEFORE INSERT OR UPDATE ON tte_conductor FOR EACH ROW
DECLARE
  v_cnt NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM station_master WHERE employee_id = :NEW.employee_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM zone_admin WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM super_admin WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20013, 'employee already has a different role (roles are disjoint)');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_sm_role_disjoint
BEFORE INSERT OR UPDATE ON station_master FOR EACH ROW
DECLARE
  v_cnt NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM tte_conductor WHERE employee_id = :NEW.employee_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM zone_admin WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM super_admin WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20014, 'employee already has a different role (roles are disjoint)');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_za_role_disjoint
BEFORE INSERT OR UPDATE ON zone_admin FOR EACH ROW
DECLARE
  v_cnt NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM tte_conductor WHERE employee_id = :NEW.employee_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM station_master WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM super_admin WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20015, 'employee already has a different role (roles are disjoint)');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_sa_role_disjoint
BEFORE INSERT OR UPDATE ON super_admin FOR EACH ROW
DECLARE
  v_cnt NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM tte_conductor WHERE employee_id = :NEW.employee_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM station_master WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM zone_admin WHERE employee_id = :NEW.employee_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20016, 'employee already has a different role (roles are disjoint)');
  END IF;
END;
/

-- ---------------------------------------------------------------------------
-- TRAIN specialization hierarchy (disjoint, total)
-- ---------------------------------------------------------------------------
CREATE TABLE train (
  train_id      NUMBER(10)    NOT NULL,
  train_type    CHAR(1)       NOT NULL
                  CONSTRAINT ck_train_type CHECK (train_type IN ('E','S','P','F')),
  train_no      VARCHAR2(8)   NOT NULL,
  train_name    VARCHAR2(120) NOT NULL,
  active        NUMBER(1)     DEFAULT 1 NOT NULL CONSTRAINT ck_train_active CHECK (active IN (0,1)),
  CONSTRAINT pk_train PRIMARY KEY (train_id),
  CONSTRAINT uq_train_no UNIQUE (train_no)
);

CREATE SEQUENCE seq_train START WITH 1;

CREATE OR REPLACE TRIGGER trg_train_bi
BEFORE INSERT ON train FOR EACH ROW
WHEN (NEW.train_id IS NULL)
BEGIN
  :NEW.train_id := seq_train.NEXTVAL;
END;
/

-- Subtype tables share TRAIN.train_id as PK (one-to-one, total, disjoint).
CREATE TABLE express_train (
  train_id        NUMBER(10)  NOT NULL,
  pantry_service  CHAR(1)     DEFAULT 'N' CHECK (pantry_service IN ('Y','N')),
  top_speed_kmh   NUMBER(4),
  CONSTRAINT pk_express PRIMARY KEY (train_id),
  CONSTRAINT fk_express_train FOREIGN KEY (train_id) REFERENCES train(train_id)
);

CREATE TABLE superfast_train (
  train_id             NUMBER(10) NOT NULL,
  superfast_surcharge  NUMBER(8,2) DEFAULT 45,
  premium_tatkal       CHAR(1)     DEFAULT 'N' CHECK (premium_tatkal IN ('Y','N')),
  CONSTRAINT pk_superfast PRIMARY KEY (train_id),
  CONSTRAINT fk_superfast_train FOREIGN KEY (train_id) REFERENCES train(train_id)
);

CREATE TABLE passenger_train (
  train_id     NUMBER(10) NOT NULL,
  stops_count  NUMBER(3)  DEFAULT 20,
  service_type VARCHAR2(20) DEFAULT 'INTERCITY' CHECK (service_type IN ('LOCAL','INTERCITY')),
  CONSTRAINT pk_passenger_train PRIMARY KEY (train_id),
  CONSTRAINT fk_passenger_train FOREIGN KEY (train_id) REFERENCES train(train_id)
);

CREATE TABLE freight_train (
  train_id        NUMBER(10) NOT NULL,
  cargo_type      VARCHAR2(40) NOT NULL,
  max_load_tonnes NUMBER(8)  NOT NULL,
  CONSTRAINT pk_freight PRIMARY KEY (train_id),
  CONSTRAINT fk_freight_train FOREIGN KEY (train_id) REFERENCES train(train_id)
);

-- Disjointness for TRAIN subtypes: a train row may match only one subtype.
CREATE OR REPLACE TRIGGER trg_train_subtype_disjoint
BEFORE INSERT OR UPDATE ON express_train FOR EACH ROW
DECLARE
  v_type CHAR(1);
  v_cnt  NUMBER := 0;
BEGIN
  SELECT train_type INTO v_type FROM train WHERE train_id = :NEW.train_id;
  IF v_type <> 'E' THEN
    RAISE_APPLICATION_ERROR(-20021, 'train_type must be E for express_train');
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM superfast_train WHERE train_id = :NEW.train_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM passenger_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM freight_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20022, 'train already has a different subtype (disjoint)');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_sf_disjoint
BEFORE INSERT OR UPDATE ON superfast_train FOR EACH ROW
DECLARE
  v_type CHAR(1);
  v_cnt  NUMBER := 0;
BEGIN
  SELECT train_type INTO v_type FROM train WHERE train_id = :NEW.train_id;
  IF v_type <> 'S' THEN
    RAISE_APPLICATION_ERROR(-20023, 'train_type must be S for superfast_train');
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM express_train WHERE train_id = :NEW.train_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM passenger_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM freight_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20024, 'train already has a different subtype (disjoint)');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_pt_disjoint
BEFORE INSERT OR UPDATE ON passenger_train FOR EACH ROW
DECLARE
  v_type CHAR(1);
  v_cnt  NUMBER := 0;
BEGIN
  SELECT train_type INTO v_type FROM train WHERE train_id = :NEW.train_id;
  IF v_type <> 'P' THEN
    RAISE_APPLICATION_ERROR(-20025, 'train_type must be P for passenger_train');
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM express_train WHERE train_id = :NEW.train_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM superfast_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM freight_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20026, 'train already has a different subtype (disjoint)');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_ft_disjoint
BEFORE INSERT OR UPDATE ON freight_train FOR EACH ROW
DECLARE
  v_type CHAR(1);
  v_cnt  NUMBER := 0;
BEGIN
  SELECT train_type INTO v_type FROM train WHERE train_id = :NEW.train_id;
  IF v_type <> 'F' THEN
    RAISE_APPLICATION_ERROR(-20027, 'train_type must be F for freight_train');
  END IF;
  SELECT COUNT(*) INTO v_cnt FROM express_train WHERE train_id = :NEW.train_id;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM superfast_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt = 0 THEN SELECT COUNT(*) INTO v_cnt FROM passenger_train WHERE train_id = :NEW.train_id; END IF;
  IF v_cnt > 0 THEN
    RAISE_APPLICATION_ERROR(-20028, 'train already has a different subtype (disjoint)');
  END IF;
END;
/

-- ---------------------------------------------------------------------------
-- ROUTE and STATION_ROUTE (route is an aggregation: many stops, 1 line)
-- ---------------------------------------------------------------------------
CREATE TABLE route (
  route_id         NUMBER(10)   NOT NULL,
  route_code       VARCHAR2(12) NOT NULL,
  origin_station   NUMBER(10)   NOT NULL,
  destination_station NUMBER(10) NOT NULL,
  direction        CHAR(1)      DEFAULT 'A' CHECK (direction IN ('A','B')),
  base_distance_km NUMBER(6),
  CONSTRAINT pk_route PRIMARY KEY (route_id),
  CONSTRAINT uq_route_code UNIQUE (route_code),
  CONSTRAINT fk_route_origin FOREIGN KEY (origin_station) REFERENCES station(station_id),
  CONSTRAINT fk_route_dest FOREIGN KEY (destination_station) REFERENCES station(station_id),
  CONSTRAINT ck_route_distinct CHECK (origin_station <> destination_station)
);

CREATE SEQUENCE seq_route START WITH 1;

CREATE OR REPLACE TRIGGER trg_route_bi
BEFORE INSERT ON route FOR EACH ROW
WHEN (NEW.route_id IS NULL)
BEGIN
  :NEW.route_id := seq_route.NEXTVAL;
END;
/

-- STATION_ROUTE is the relational ordered-stop definition; the object-relational
-- ROUTE.segments nested table (Phase 4) is a materialized view of this same
-- ordering, kept in one place so there is no dual source of truth.
CREATE TABLE station_route (
  route_id    NUMBER(10)  NOT NULL,
  station_id  NUMBER(10)  NOT NULL,
  stop_order  NUMBER(3)   NOT NULL,
  km_from_origin NUMBER(6),
  arrival     VARCHAR2(5),
  departure   VARCHAR2(5),
  CONSTRAINT pk_station_route PRIMARY KEY (route_id, station_id),
  CONSTRAINT uq_station_route_order UNIQUE (route_id, stop_order),
  CONSTRAINT fk_sr_route FOREIGN KEY (route_id) REFERENCES route(route_id),
  CONSTRAINT fk_sr_station FOREIGN KEY (station_id) REFERENCES station(station_id)
);
-- B-tree on FK to STATION for station views (station master schedules).
CREATE INDEX idx_sr_station ON station_route(station_id);
-- Hot index for journey-segment lookup by stop range.
CREATE INDEX idx_sr_order ON station_route(route_id, stop_order);

CREATE TABLE train_route (
  train_id     NUMBER(10)   NOT NULL,
  route_id     NUMBER(10)   NOT NULL,
  is_active    NUMBER(1)    DEFAULT 1 NOT NULL CHECK (is_active IN (0,1)),
  valid_from   DATE         DEFAULT SYSDATE,
  CONSTRAINT pk_train_route PRIMARY KEY (train_id, route_id),
  CONSTRAINT fk_tr_train FOREIGN KEY (train_id) REFERENCES train(train_id),
  CONSTRAINT fk_tr_route FOREIGN KEY (route_id) REFERENCES route(route_id)
);

-- ---------------------------------------------------------------------------
-- FARE_RULE (semi-structured rule document arrives in Phase 5 as a JSON column)
-- ---------------------------------------------------------------------------
CREATE TABLE fare_rule (
  rule_id           NUMBER(10)   NOT NULL,
  train_type        CHAR(1)      NOT NULL,
  coach_class       VARCHAR2(3)  NOT NULL,
  base_rate_per_km  NUMBER(8,2)  NOT NULL,
  min_fare          NUMBER(8,2)  NOT NULL,
  max_fare          NUMBER(8,2)  NOT NULL,
  effective_from    DATE         DEFAULT SYSDATE NOT NULL,
  effective_to      DATE,
  fare_json         CLOB,          -- JSON document, parsed in Phase 5
  CONSTRAINT pk_fare_rule PRIMARY KEY (rule_id),
  CONSTRAINT ck_fare_rules_json CHECK (fare_json IS NULL OR
    (fare_json LIKE '{%' OR fare_json LIKE '[%')),
  CONSTRAINT uq_fare_rule UNIQUE (train_type, coach_class, effective_from)
);

CREATE SEQUENCE seq_fare_rule START WITH 1;

CREATE OR REPLACE TRIGGER trg_fare_rule_bi
BEFORE INSERT ON fare_rule FOR EACH ROW
WHEN (NEW.rule_id IS NULL)
BEGIN
  :NEW.rule_id := seq_fare_rule.NEXTVAL;
END;
/

-- ---------------------------------------------------------------------------
-- Booking family (COACH, SEAT, TRAIN_SCHEDULE, BOOKING, TICKET, PAYMENT, ...)
-- Identical DDL is deployed into each zone schema for the fragmentation demo.
-- ---------------------------------------------------------------------------
@@../zone_common/booking_family.sql

-- ---------------------------------------------------------------------------
-- IoT telemetry family (Phase 7): sensors, readings, alerts. Same DDL in every
-- zone schema; readings are written to the zone owning the coach.
-- ---------------------------------------------------------------------------
@@../zone_common/iot_family.sql

-- ---------------------------------------------------------------------------
-- TTE duty / station announcement (operational views used by later phases)
-- ---------------------------------------------------------------------------
CREATE TABLE tte_assignment (
  assignment_id NUMBER(10)   NOT NULL,
  employee_id   NUMBER(10)   NOT NULL,
  schedule_id   NUMBER(12)   NOT NULL,
  duty_from     DATE         NOT NULL,
  duty_to       DATE,
  status        VARCHAR2(10) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DONE')),
  CONSTRAINT pk_tte_assignment PRIMARY KEY (assignment_id),
  CONSTRAINT fk_tta_emp FOREIGN KEY (employee_id) REFERENCES tte_conductor(employee_id),
  CONSTRAINT uq_tta UNIQUE (employee_id, schedule_id)
);

CREATE SEQUENCE seq_tte_assignment START WITH 1;

CREATE OR REPLACE TRIGGER trg_tta_bi
BEFORE INSERT ON tte_assignment FOR EACH ROW
WHEN (NEW.assignment_id IS NULL)
BEGIN
  :NEW.assignment_id := seq_tte_assignment.NEXTVAL;
END;
/

CREATE TABLE station_announcement (
  announcement_id NUMBER(10)  NOT NULL,
  station_id      NUMBER(10)  NOT NULL,
  message         VARCHAR2(300) NOT NULL,
  created_by      NUMBER(10)  NOT NULL,
  active_until    DATE,
  created_at      TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_announcement PRIMARY KEY (announcement_id),
  CONSTRAINT fk_ann_emp FOREIGN KEY (created_by) REFERENCES employee(person_id),
  CONSTRAINT fk_ann_station FOREIGN KEY (station_id) REFERENCES station(station_id)
);

CREATE SEQUENCE seq_announcement START WITH 1;

CREATE OR REPLACE TRIGGER trg_ann_bi
BEFORE INSERT ON station_announcement FOR EACH ROW
WHEN (NEW.announcement_id IS NULL)
BEGIN
  :NEW.announcement_id := seq_announcement.NEXTVAL;
END;
/