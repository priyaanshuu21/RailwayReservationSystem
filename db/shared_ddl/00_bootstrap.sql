-- =============================================================================
-- RailNexus - 00_bootstrap.sql
-- Creates all RailNexus application schemas and grants the privileges they
-- need. Run as a DBA/SYSTEM connection. Re-runnable: users are dropped and
-- re-created so the whole schema install is reproducible.
--
-- WARNING: this drops the RAILNEXUS* schemas. Run on a dedicated dev database,
-- never against an existing production instance without confirmation.
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

DECLARE
  TYPE t_users IS TABLE OF VARCHAR2(40);
  v_users t_users := t_users('RAILNEXUS_REPORTING','RAILNEXUS_SOUTH',
                             'RAILNEXUS_WEST','RAILNEXUS_NORTH','RAILNEXUS');
BEGIN
  FOR i IN 1 .. v_users.COUNT LOOP
    BEGIN
      EXECUTE IMMEDIATE 'DROP USER ' || v_users(i) || ' CASCADE';
      DBMS_OUTPUT.PUT_LINE('dropped user ' || v_users(i));
    EXCEPTION WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('no user ' || v_users(i));
    END;
  END LOOP;
END;
/

-- Create the shared application schema.
BEGIN
  EXECUTE IMMEDIATE q'[CREATE USER RAILNEXUS IDENTIFIED BY railnexus_dev
      DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS]';
  EXECUTE IMMEDIATE 'GRANT CONNECT, RESOURCE TO RAILNEXUS';
  EXECUTE IMMEDIATE 'GRANT CREATE VIEW, CREATE SYNONYM, CREATE DATABASE LINK,
    CREATE MATERIALIZED VIEW, CREATE TRIGGER, CREATE TYPE,
    CREATE PROCEDURE, CREATE SEQUENCE, CREATE JOB, ALTER SESSION TO RAILNEXUS';
  EXECUTE IMMEDIATE 'GRANT EXECUTE ON SYS.DBMS_XMLGEN TO RAILNEXUS';
  EXECUTE IMMEDIATE 'GRANT EXECUTE ON SYS.DBMS_SCHEDULER TO RAILNEXUS';
  DBMS_OUTPUT.PUT_LINE('created RAILNEXUS');
END;
/

-- Create the three zone schemas (horizontal fragmentation demonstration).
DECLARE
  TYPE t_zones IS TABLE OF VARCHAR2(40);
  v_zones t_zones := t_zones('RAILNEXUS_NORTH','RAILNEXUS_WEST','RAILNEXUS_SOUTH');
BEGIN
  FOR i IN 1 .. v_zones.COUNT LOOP
    EXECUTE IMMEDIATE 'CREATE USER ' || v_zones(i) ||
      q'[ IDENTIFIED BY railnexus_dev DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS]';
    EXECUTE IMMEDIATE 'GRANT CONNECT, RESOURCE TO ' || v_zones(i);
    EXECUTE IMMEDIATE 'GRANT CREATE VIEW, CREATE SYNONYM, CREATE DATABASE LINK,
      CREATE MATERIALIZED VIEW, CREATE TRIGGER, CREATE TYPE,
      CREATE PROCEDURE, CREATE SEQUENCE, CREATE JOB, ALTER SESSION TO ' || v_zones(i);
    DBMS_OUTPUT.PUT_LINE('created ' || v_zones(i));
  END LOOP;
END;
/

-- Reporting mart schema (Phase 10).
BEGIN
  EXECUTE IMMEDIATE 'CREATE USER RAILNEXUS_REPORTING IDENTIFIED BY railnexus_dev
    DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS';
  EXECUTE IMMEDIATE 'GRANT CONNECT, RESOURCE TO RAILNEXUS_REPORTING';
  EXECUTE IMMEDIATE 'GRANT CREATE VIEW, CREATE SYNONYM, CREATE MATERIALIZED VIEW,
    CREATE PROCEDURE, ALTER SESSION TO RAILNEXUS_REPORTING';
  DBMS_OUTPUT.PUT_LINE('created RAILNEXUS_REPORTING');
END;
/

WHENEVER SQLERROR EXIT
PROMPT Bootstrap complete