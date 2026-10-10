-- =============================================================================
-- RailNexus - Phase 10: pkg_reporting (materialized-view refresh).
-- =============================================================================

SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE

CREATE OR REPLACE PACKAGE pkg_reporting IS
  PROCEDURE refresh_materialized(o_message OUT VARCHAR2);
END pkg_reporting;
/
SHOW ERRORS

CREATE OR REPLACE PACKAGE BODY pkg_reporting IS
  PROCEDURE refresh_materialized(o_message OUT VARCHAR2) IS
  BEGIN
    DBMS_MVIEW.REFRESH('MV_REVENUE_BY_TRAIN', 'C');
    o_message := 'mv_revenue_by_train refreshed';
  EXCEPTION
    WHEN OTHERS THEN
      o_message := 'refresh failed: ' || SQLERRM;
      RAISE;
  END refresh_materialized;
END pkg_reporting;
/
SHOW ERRORS

WHENEVER SQLERROR EXIT
PROMPT pkg_reporting installed
