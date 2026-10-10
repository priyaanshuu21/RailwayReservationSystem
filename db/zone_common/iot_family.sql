-- =============================================================================
-- RailNexus - iot_family.sql  (Phase 7: IoT / telemetry)
-- Coach-mounted sensor catalogue, its high-volume reading log and raised
-- alerts. Included by BOTH db/shared_ddl/01_core_schema.sql and
-- db/zone_common/schema.sql so the DDL is identical in every schema; readings
-- themselves are written into the zone that owns the coach (fragmentation).
--
-- Readings are append-only and read newest-first; the composite index
-- (sensor_id, reading_time DESC) serves both the "latest value" lookup and
-- window scans. On 11g the time-series stays a plain table; on 12.2+ it can be
-- converted to an interval-partitioned table (see schema-notes.md).
-- =============================================================================

CREATE TABLE iot_sensor (
  sensor_id     NUMBER(14)   NOT NULL,
  coach_id      NUMBER(12)   NOT NULL,
  sensor_code   VARCHAR2(20) NOT NULL,
  sensor_kind   VARCHAR2(12) NOT NULL
                  CONSTRAINT ck_sensor_kind CHECK (sensor_kind IN ('TEMP','SMOKE','DOOR','AQI')),
  unit          VARCHAR2(10),
  min_value     NUMBER(10,2) NOT NULL,
  max_value     NUMBER(10,2) NOT NULL,
  active        CHAR(1)      DEFAULT 'Y' NOT NULL
                  CONSTRAINT ck_sensor_active CHECK (active IN ('Y','N')),
  installed_at  DATE         DEFAULT SYSDATE NOT NULL,
  CONSTRAINT pk_iot_sensor PRIMARY KEY (sensor_id),
  CONSTRAINT uq_iot_sensor_code UNIQUE (coach_id, sensor_code),
  CONSTRAINT ck_iot_sensor_band CHECK (min_value < max_value),
  CONSTRAINT fk_iot_sensor_coach FOREIGN KEY (coach_id) REFERENCES coach(coach_id)
);
CREATE INDEX idx_iot_sensor_coach ON iot_sensor(coach_id);

CREATE SEQUENCE seq_iot_sensor START WITH 1;

CREATE OR REPLACE TRIGGER trg_iot_sensor_bi
BEFORE INSERT ON iot_sensor FOR EACH ROW
WHEN (NEW.sensor_id IS NULL)
BEGIN
  :NEW.sensor_id := seq_iot_sensor.NEXTVAL;
END;
/

CREATE TABLE sensor_reading (
  reading_id    NUMBER(18)   NOT NULL,
  sensor_id     NUMBER(14)   NOT NULL,
  reading_time  TIMESTAMP    DEFAULT SYSTIMESTAMP NOT NULL,
  value         NUMBER(12,3) NOT NULL,
  status        VARCHAR2(8)  DEFAULT 'OK' NOT NULL
                  CONSTRAINT ck_reading_status CHECK (status IN ('OK','WARN','CRITICAL')),
  CONSTRAINT pk_sensor_reading PRIMARY KEY (reading_id),
  CONSTRAINT fk_reading_sensor FOREIGN KEY (sensor_id) REFERENCES iot_sensor(sensor_id)
);
-- Newest-first per sensor + time-window range scans.
CREATE INDEX idx_reading_sensor_time ON sensor_reading(sensor_id, reading_time DESC);

CREATE SEQUENCE seq_sensor_reading START WITH 1;

CREATE OR REPLACE TRIGGER trg_sensor_reading_bi
BEFORE INSERT ON sensor_reading FOR EACH ROW
WHEN (NEW.reading_id IS NULL)
BEGIN
  :NEW.reading_id := seq_sensor_reading.NEXTVAL;
END;
/

CREATE TABLE sensor_alert (
  alert_id      NUMBER(18)   NOT NULL,
  sensor_id     NUMBER(14)   NOT NULL,
  reading_id    NUMBER(18),
  severity      VARCHAR2(8)  DEFAULT 'HIGH' NOT NULL
                  CONSTRAINT ck_alert_sev CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  status        VARCHAR2(8)  DEFAULT 'OPEN' NOT NULL
                  CONSTRAINT ck_alert_status CHECK (status IN ('OPEN','ACK','CLOSED')),
  message       VARCHAR2(300) NOT NULL,
  raised_at     TIMESTAMP    DEFAULT SYSTIMESTAMP NOT NULL,
  acknowledged_by VARCHAR2(100),
  acknowledged_at TIMESTAMP,
  CONSTRAINT pk_sensor_alert PRIMARY KEY (alert_id),
  CONSTRAINT fk_alert_sensor FOREIGN KEY (sensor_id) REFERENCES iot_sensor(sensor_id),
  CONSTRAINT fk_alert_reading FOREIGN KEY (reading_id) REFERENCES sensor_reading(reading_id)
);
CREATE INDEX idx_alert_status ON sensor_alert(status, raised_at DESC);

CREATE SEQUENCE seq_sensor_alert START WITH 1;

CREATE OR REPLACE TRIGGER trg_sensor_alert_bi
BEFORE INSERT ON sensor_alert FOR EACH ROW
WHEN (NEW.alert_id IS NULL)
BEGIN
  :NEW.alert_id := seq_sensor_alert.NEXTVAL;
END;
/
