WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
-- RAC has three characters; the original CHAR(2) could only store WL.
ALTER TABLE waitlist_queue MODIFY (queue_type CHAR(3));
