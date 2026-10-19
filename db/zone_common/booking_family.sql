-- =============================================================================
-- RailNexus - booking_family.sql
-- The transactional heart of RailNexus: schedule, coach, seat, segment
-- occupancy, bookings, tickets (specialization), payments (specialization),
-- refunds, fare breakdowns and the durable outbox.
--
-- This file is included BOTH by:
--   db/shared_ddl/01_core_schema.sql   (shared/mirror schema, also seeds it)
--   db/zone_*/schema.sql               (each zone schema, authority per zone)
-- so the DDL is identical everywhere: horizontal fragmentation by ZONE_ID.
--
-- Concurrency design
--   * SEAT rows are locked with SELECT ... FOR UPDATE SKIP LOCKED before any
--     allocation; SEAT_SEGMENT occupancy is validated inside that lock.
--   * A physical seat can host several passengers on non-overlapping station
--     segments of the same journey, so occupancy is tracked per segment.
--   * BOOKING and PAYMENT are idempotent: unique request/booking-reference and
--     payment idempotency keys.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TRAIN_SCHEDULE: one row per train/route/journey date. (train_id, journey_date)
-- is the hottest lookup key, so it gets a unique constraint (index).
-- ---------------------------------------------------------------------------
CREATE TABLE train_schedule (
  schedule_id    NUMBER(12)    NOT NULL,
  train_id       NUMBER(10)    NOT NULL,
  route_id       NUMBER(10)    NOT NULL,
  zone_id        NUMBER(6)     NOT NULL,
  journey_date   DATE          NOT NULL,
  departure_time TIMESTAMP     NOT NULL,
  arrival_time   TIMESTAMP     NOT NULL,
  status         VARCHAR2(10)  DEFAULT 'ACTIVE' NOT NULL
                   CHECK (status IN ('ACTIVE','CANCELLED','RUNNING','COMPLETED')),
  CONSTRAINT pk_schedule PRIMARY KEY (schedule_id),
  CONSTRAINT uq_schedule_train_date UNIQUE (train_id, journey_date),
  CONSTRAINT fk_sched_train FOREIGN KEY (train_id) REFERENCES train(train_id),
  CONSTRAINT fk_sched_route FOREIGN KEY (route_id) REFERENCES route(route_id),
  CONSTRAINT fk_sched_zone FOREIGN KEY (zone_id) REFERENCES zone(zone_id)
);
-- Composite index for the availability hotspot: trains on a date by zone.
CREATE INDEX idx_sched_zone_date ON train_schedule(zone_id, journey_date);

CREATE SEQUENCE seq_schedule START WITH 1;

CREATE OR REPLACE TRIGGER trg_schedule_bi
BEFORE INSERT ON train_schedule FOR EACH ROW
WHEN (NEW.schedule_id IS NULL)
BEGIN
  :NEW.schedule_id := seq_schedule.NEXTVAL;
END;
/

-- Per-schedule class policy: RAC capacity and waitlist depth per class.
CREATE TABLE schedule_class_policy (
  schedule_id    NUMBER(12)  NOT NULL,
  coach_class    VARCHAR2(3) NOT NULL,
  rac_capacity   NUMBER(4)   DEFAULT 0 NOT NULL,
  waitlist_limit NUMBER(4)   DEFAULT 50 NOT NULL,
  CONSTRAINT pk_sched_class PRIMARY KEY (schedule_id, coach_class),
  CONSTRAINT fk_scp_sched FOREIGN KEY (schedule_id) REFERENCES train_schedule(schedule_id)
);

-- ---------------------------------------------------------------------------
-- COACH and SEAT (physical inventory)
-- ---------------------------------------------------------------------------
CREATE TABLE coach (
  coach_id         NUMBER(12)   NOT NULL,
  schedule_id      NUMBER(12)   NOT NULL,
  coach_no         VARCHAR2(8)  NOT NULL,
  coach_class      VARCHAR2(3)  NOT NULL,
  coach_capacity   NUMBER(4)    NOT NULL,
  class_quota      NUMBER(4)    NOT NULL,  -- confirmed seats allowed for this class
  CONSTRAINT pk_coach PRIMARY KEY (coach_id),
  CONSTRAINT uq_coach_sched_no UNIQUE (schedule_id, coach_no),
  CONSTRAINT fk_coach_sched FOREIGN KEY (schedule_id) REFERENCES train_schedule(schedule_id),
  CONSTRAINT ck_coach_quota CHECK (class_quota <= coach_capacity)
);

CREATE SEQUENCE seq_coach START WITH 1;

CREATE OR REPLACE TRIGGER trg_coach_bi
BEFORE INSERT ON coach FOR EACH ROW
WHEN (NEW.coach_id IS NULL)
BEGIN
  :NEW.coach_id := seq_coach.NEXTVAL;
END;
/

CREATE TABLE seat (
  seat_id             NUMBER(14) NOT NULL,
  coach_id            NUMBER(12) NOT NULL,
  seat_no             VARCHAR2(6) NOT NULL,
  berth_type          VARCHAR2(12),
  status              CHAR(1)    DEFAULT 'A' NOT NULL
                        CONSTRAINT ck_seat_status CHECK (status IN ('A','B','R','W','O')),
  current_from_stop   NUMBER(3),   -- active occupancy segment start
  current_to_stop     NUMBER(3),   -- active occupancy segment end
  version             NUMBER(6)    DEFAULT 0 NOT NULL, -- optimistic locking demo
  CONSTRAINT pk_seat PRIMARY KEY (seat_id),
  CONSTRAINT uq_seat_coach_no UNIQUE (coach_id, seat_no),
  CONSTRAINT fk_seat_coach FOREIGN KEY (coach_id) REFERENCES coach(coach_id)
);
-- Availability scans lock candidate rows by coach and status.
CREATE INDEX idx_seat_coach_status ON seat(coach_id, status);

CREATE SEQUENCE seq_seat START WITH 1;

CREATE OR REPLACE TRIGGER trg_seat_bi
BEFORE INSERT ON seat FOR EACH ROW
WHEN (NEW.seat_id IS NULL)
BEGIN
  :NEW.seat_id := seq_seat.NEXTVAL;
END;
/

-- SEAT_SEGMENT records which station-segments of a journey a seat is occupied over.
CREATE TABLE seat_segment (
  segment_id NUMBER(14) NOT NULL,
  seat_id    NUMBER(14) NOT NULL,
  from_stop  NUMBER(3)  NOT NULL,
  to_stop    NUMBER(3)  NOT NULL,
  status     CHAR(1)    DEFAULT 'F' NOT NULL CHECK (status IN ('F','O')),
  booking_id NUMBER(12),
  CONSTRAINT pk_seat_segment PRIMARY KEY (segment_id),
  CONSTRAINT uq_seat_segment UNIQUE (seat_id, from_stop, to_stop),
  CONSTRAINT fk_seg_seat FOREIGN KEY (seat_id) REFERENCES seat(seat_id) ON DELETE CASCADE,
  CONSTRAINT ck_seat_segment_range CHECK (to_stop > from_stop)
);

CREATE SEQUENCE seq_seat_segment START WITH 1;

-- ---------------------------------------------------------------------------
-- BOOKING (header) and BOOKING_AUDIT
-- ---------------------------------------------------------------------------
CREATE TABLE booking (
  booking_id      NUMBER(12)   NOT NULL,
  request_id      VARCHAR2(40) NOT NULL,          -- idempotency key from caller
  booking_ref     VARCHAR2(12) NOT NULL,
  person_id       NUMBER(10)   NOT NULL,
  schedule_id     NUMBER(12)   NOT NULL,
  coach_class     VARCHAR2(3)  NOT NULL,
  from_station_id NUMBER(10)   NOT NULL,
  to_station_id   NUMBER(10)   NOT NULL,
  from_stop_order NUMBER(3)    NOT NULL,
  to_stop_order   NUMBER(3)    NOT NULL,
  coach_id        NUMBER(12),
  seat_id         NUMBER(14),
  status          CHAR(3)      NOT NULL CHECK (status IN ('BOK','CAN')),
  fare_total      NUMBER(12,2) NOT NULL,
  discount        NUMBER(10,2) DEFAULT 0,
  booked_at       TIMESTAMP    DEFAULT SYSTIMESTAMP NOT NULL,
  request_date    DATE         DEFAULT SYSDATE NOT NULL,
  CONSTRAINT pk_booking PRIMARY KEY (booking_id),
  CONSTRAINT uq_booking_request UNIQUE (request_id),
  CONSTRAINT uq_booking_ref UNIQUE (booking_ref),
  CONSTRAINT fk_booking_person FOREIGN KEY (person_id) REFERENCES person(person_id),
  CONSTRAINT fk_booking_sched FOREIGN KEY (schedule_id) REFERENCES train_schedule(schedule_id),
  CONSTRAINT fk_booking_from FOREIGN KEY (from_station_id) REFERENCES station(station_id),
  CONSTRAINT fk_booking_to FOREIGN KEY (to_station_id) REFERENCES station(station_id),
  CONSTRAINT fk_booking_coach FOREIGN KEY (coach_id) REFERENCES coach(coach_id),
  CONSTRAINT ck_booking_range CHECK (to_stop_order > from_stop_order)
);
-- Confirmed coach/seat allocation needs to be found by seat quickly.
CREATE INDEX idx_booking_seat ON booking(seat_id);
CREATE INDEX idx_booking_person ON booking(person_id);
CREATE INDEX idx_booking_sched ON booking(schedule_id, status);

CREATE SEQUENCE seq_booking START WITH 1;

CREATE OR REPLACE TRIGGER trg_booking_bi
BEFORE INSERT ON booking FOR EACH ROW
WHEN (NEW.booking_id IS NULL)
BEGIN
  :NEW.booking_id := seq_booking.NEXTVAL;
END;
/

CREATE TABLE booking_audit (
  audit_id    NUMBER(14) NOT NULL,
  booking_id  NUMBER(12) NOT NULL,
  event_type  VARCHAR2(30) NOT NULL,
  event_time  TIMESTAMP  DEFAULT SYSTIMESTAMP NOT NULL,
  before_state CLOB,
  after_state  CLOB,
  performed_by NUMBER(10),
  outbox_event_id NUMBER(14),  -- set by the trigger when Phase 5 outbox is enabled
  CONSTRAINT pk_booking_audit PRIMARY KEY (audit_id),
  CONSTRAINT fk_audit_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE SEQUENCE seq_booking_audit START WITH 1;

-- ---------------------------------------------------------------------------
-- TICKET specialization: TICKET supertype + CONFIRMED/RAC/WAITLISTED subtypes.
-- Each booking owns exactly one ticket. PNR is 10 chars: 2 alpha + 8 alnum.
-- ---------------------------------------------------------------------------
CREATE TABLE ticket (
  ticket_id    NUMBER(14)  NOT NULL,
  booking_id   NUMBER(12)  NOT NULL,
  schedule_id  NUMBER(12)  NOT NULL,
  ticket_type  CHAR(1)     NOT NULL CHECK (ticket_type IN ('C','R','W')),
  pnr          VARCHAR2(10) NOT NULL,
  status       VARCHAR2(4) NOT NULL CHECK (status IN ('CFM','RAC','WL','CNL','BKD')),
  created_at   TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_ticket PRIMARY KEY (ticket_id),
  CONSTRAINT uq_ticket_booking UNIQUE (booking_id),
  CONSTRAINT uq_ticket_pnr UNIQUE (pnr),
  CONSTRAINT ck_ticket_pnr CHECK (REGEXP_LIKE(pnr, '^[A-Z0-9]{10}$')),
  CONSTRAINT fk_ticket_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
  CONSTRAINT fk_ticket_sched FOREIGN KEY (schedule_id) REFERENCES train_schedule(schedule_id)
);
-- uq_ticket_pnr already indexes PNR, so no separate PNR lookup index is needed.

CREATE SEQUENCE seq_ticket START WITH 1;

CREATE OR REPLACE TRIGGER trg_ticket_bi
BEFORE INSERT ON ticket FOR EACH ROW
WHEN (NEW.ticket_id IS NULL)
BEGIN
  :NEW.ticket_id := seq_ticket.NEXTVAL;
END;
/

-- CONFIRMED_TICKET
CREATE TABLE confirmed_ticket (
  ticket_id       NUMBER(14) NOT NULL,
  coach_id        NUMBER(12) NOT NULL,
  seat_id         NUMBER(14) NOT NULL,
  berth           VARCHAR2(12),
  from_stop_order NUMBER(3)  NOT NULL,
  to_stop_order   NUMBER(3)  NOT NULL,
  boarding_status CHAR(1)    DEFAULT 'N' NOT NULL CHECK (boarding_status IN ('N','B')),
  boarding_time   TIMESTAMP,
  CONSTRAINT pk_confirmed_ticket PRIMARY KEY (ticket_id),
  CONSTRAINT fk_ct_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
  CONSTRAINT fk_ct_coach FOREIGN KEY (coach_id) REFERENCES coach(coach_id),
  CONSTRAINT fk_ct_seat FOREIGN KEY (seat_id) REFERENCES seat(seat_id)
);

-- RAC_TICKET (shares a seat with boarding detach; position tracked in queue)
CREATE TABLE rac_ticket (
  ticket_id NUMBER(14) NOT NULL,
  coach_id  NUMBER(12) NOT NULL,
  seat_id   NUMBER(14) NOT NULL,
  berth     VARCHAR2(12),
  CONSTRAINT pk_rac_ticket PRIMARY KEY (ticket_id),
  CONSTRAINT fk_rt_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id),
  CONSTRAINT fk_rt_coach FOREIGN KEY (coach_id) REFERENCES coach(coach_id),
  CONSTRAINT fk_rt_seat FOREIGN KEY (seat_id) REFERENCES seat(seat_id)
);

-- WAITLISTED_TICKET (position derived from WAITLIST_QUEUE)
CREATE TABLE waitlisted_ticket (
  ticket_id NUMBER(14) NOT NULL,
  position  NUMBER(6)  NOT NULL,
  CONSTRAINT pk_wl_ticket PRIMARY KEY (ticket_id),
  CONSTRAINT fk_wlt_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id)
);

-- ---------------------------------------------------------------------------
-- WAITLIST_QUEUE: strict FIFO per schedule AND coach class. Position 1..n.
-- Defined after TICKET so the queue rows can point at tickets via a real FK.
-- ---------------------------------------------------------------------------
CREATE TABLE waitlist_queue (
  queue_id      NUMBER(14) NOT NULL,
  schedule_id   NUMBER(12) NOT NULL,
  coach_class   VARCHAR2(3) NOT NULL,
  ticket_id     NUMBER(14) NOT NULL,
  position      NUMBER(6)  NOT NULL,
  queue_type    CHAR(3)    NOT NULL CHECK (queue_type IN ('RAC','WL')),
  enqueued_at   TIMESTAMP  DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_waitlist PRIMARY KEY (queue_id),
  CONSTRAINT uq_waitlist_pos UNIQUE (schedule_id, coach_class, position), -- FIFO per class
  CONSTRAINT fk_wl_sched FOREIGN KEY (schedule_id) REFERENCES train_schedule(schedule_id),
  CONSTRAINT fk_wl_ticket FOREIGN KEY (ticket_id) REFERENCES ticket(ticket_id)
);

CREATE SEQUENCE seq_waitlist START WITH 1;

CREATE OR REPLACE TRIGGER trg_waitlist_bi
BEFORE INSERT ON waitlist_queue FOR EACH ROW
WHEN (NEW.queue_id IS NULL)
BEGIN
  :NEW.queue_id := seq_waitlist.NEXTVAL;
END;
/

-- ---------------------------------------------------------------------------
-- PAYMENT specialization: UPI/CARD/WALLET subtypes; card data masked/tokenized.
-- ---------------------------------------------------------------------------
CREATE TABLE payment (
  payment_id       NUMBER(14)  NOT NULL,
  booking_id       NUMBER(12)  NOT NULL,
  payment_method   CHAR(1)     NOT NULL CHECK (payment_method IN ('U','C','W')),
  amount           NUMBER(12,2) NOT NULL,
  currency         VARCHAR2(3) DEFAULT 'INR',
  status           CHAR(3)     NOT NULL CHECK (status IN ('PND','CAP','REF','FAL')),
  provider_ref     VARCHAR2(40) NOT NULL,        -- gateway request ref
  provider_capture_ref VARCHAR2(40),
  provider_refund_ref  VARCHAR2(40),
  request_id       VARCHAR2(40) NOT NULL,        -- idempotency key
  processed_at     TIMESTAMP,
  error_code       VARCHAR2(20),
  CONSTRAINT pk_payment PRIMARY KEY (payment_id),
  CONSTRAINT uq_payment_request UNIQUE (request_id),
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);
CREATE INDEX idx_payment_booking ON payment(booking_id, status);

CREATE SEQUENCE seq_payment START WITH 1;

CREATE OR REPLACE TRIGGER trg_payment_bi
BEFORE INSERT ON payment FOR EACH ROW
WHEN (NEW.payment_id IS NULL)
BEGIN
  :NEW.payment_id := seq_payment.NEXTVAL;
END;
/

CREATE TABLE upi_payment (
  payment_id  NUMBER(14) NOT NULL,
  upi_handle  VARCHAR2(60) NOT NULL,
  collector_rp VARCHAR2(60),
  CONSTRAINT pk_upi PRIMARY KEY (payment_id),
  CONSTRAINT fk_upi_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id)
);

CREATE TABLE card_payment (
  payment_id   NUMBER(14) NOT NULL,
  masked_pan   VARCHAR2(19) NOT NULL,   -- e.g. 411111XXXXXX1111, never full PAN
  card_scheme  VARCHAR2(12),
  auth_token   VARCHAR2(80),
  CONSTRAINT pk_card PRIMARY KEY (payment_id),
  CONSTRAINT fk_card_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id),
  CONSTRAINT ck_mask CHECK (masked_pan NOT LIKE '%.%' AND LENGTH(masked_pan) = 19)
);

CREATE TABLE wallet_payment (
  payment_id    NUMBER(14) NOT NULL,
  wallet_provider VARCHAR2(30) NOT NULL,
  wallet_txn_id VARCHAR2(40) NOT NULL,
  CONSTRAINT pk_wallet PRIMARY KEY (payment_id),
  CONSTRAINT fk_wallet_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id)
);

-- ---------------------------------------------------------------------------
-- REFUND (reverse money movement of one payment; idempotent by key)
-- ---------------------------------------------------------------------------
CREATE TABLE refund (
  refund_id      NUMBER(14)  NOT NULL,
  payment_id     NUMBER(14)  NOT NULL,
  amount         NUMBER(12,2) NOT NULL,
  reason         VARCHAR2(100),
  status         VARCHAR2(4) NOT NULL CHECK (status IN ('REQ','APP','RCV','FAL')),
  initiator      NUMBER(10),
  requester_request_id VARCHAR2(40) NOT NULL,
  created_at     TIMESTAMP   DEFAULT SYSTIMESTAMP NOT NULL,
  processed_at   TIMESTAMP,
  CONSTRAINT pk_refund PRIMARY KEY (refund_id),
  CONSTRAINT uq_refund_request UNIQUE (requester_request_id),
  CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payment(payment_id)
);

CREATE SEQUENCE seq_refund START WITH 1;

CREATE OR REPLACE TRIGGER trg_refund_bi
BEFORE INSERT ON refund FOR EACH ROW
WHEN (NEW.refund_id IS NULL)
BEGIN
  :NEW.refund_id := seq_refund.NEXTVAL;
END;
/

-- ---------------------------------------------------------------------------
-- FARE_BREAKUP: itemized charge lines per booking.
-- ---------------------------------------------------------------------------
CREATE TABLE fare_breakup (
  fare_id    NUMBER(14)  NOT NULL,
  booking_id NUMBER(12)  NOT NULL,
  component  VARCHAR2(30) NOT NULL,
  amount     NUMBER(12,2) NOT NULL,
  CONSTRAINT pk_fare_breakup PRIMARY KEY (fare_id),
  CONSTRAINT fk_fb_booking FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
  CONSTRAINT uq_fb UNIQUE (booking_id, component)
);

CREATE SEQUENCE seq_fare_breakup START WITH 1;

CREATE OR REPLACE TRIGGER trg_fare_breakup_bi
BEFORE INSERT ON fare_breakup FOR EACH ROW
WHEN (NEW.fare_id IS NULL)
BEGIN
  :NEW.fare_id := seq_fare_breakup.NEXTVAL;
END;
/

-- ---------------------------------------------------------------------------
-- DOMAIN_OUTBOX: durable outbox for cross-store events (Phase 5 monitors this).
-- The audit trigger writes here in the SAME transaction so nothing is lost.
-- ---------------------------------------------------------------------------
CREATE TABLE domain_outbox (
  event_id      NUMBER(14)   NOT NULL,
  event_type    VARCHAR2(40) NOT NULL,
  aggregate_type VARCHAR2(30) NOT NULL,
  aggregate_id  VARCHAR2(30) NOT NULL,
  payload       CLOB         NOT NULL,
  status        CHAR(1)      DEFAULT 'N' NOT NULL CHECK (status IN ('N','S','F')),
  attempts      NUMBER(4)    DEFAULT 0 NOT NULL,
  next_attempt  TIMESTAMP    DEFAULT SYSTIMESTAMP NOT NULL,
  created_at    TIMESTAMP    DEFAULT SYSTIMESTAMP NOT NULL,
  delivered_at  TIMESTAMP,
  CONSTRAINT pk_outbox PRIMARY KEY (event_id)
);
CREATE INDEX idx_outbox_pending ON domain_outbox(status, next_attempt);

CREATE SEQUENCE seq_outbox START WITH 1;

CREATE OR REPLACE TRIGGER trg_outbox_bi
BEFORE INSERT ON domain_outbox FOR EACH ROW
WHEN (NEW.event_id IS NULL)
BEGIN
  :NEW.event_id := seq_outbox.NEXTVAL;
END;
/