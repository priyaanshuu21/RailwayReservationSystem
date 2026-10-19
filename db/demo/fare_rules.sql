WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE v_max NUMBER; v_next NUMBER; BEGIN
 SELECT NVL(MAX(rule_id),0) INTO v_max FROM fare_rule;
 LOOP SELECT seq_fare_rule.NEXTVAL INTO v_next FROM dual; EXIT WHEN v_next>=v_max; END LOOP;
END;
/
INSERT INTO fare_rule(rule_id,train_type,coach_class,base_rate_per_km,min_fare,max_fare,effective_from,effective_to,fare_json)
SELECT seq_fare_rule.NEXTVAL,f.train_type,f.coach_class,f.base_rate_per_km,f.min_fare,f.max_fare,DATE '2026-01-01',NULL,f.fare_json
FROM fare_rule f WHERE f.effective_from=(SELECT MIN(f2.effective_from) FROM fare_rule f2 WHERE f2.train_type=f.train_type AND f2.coach_class=f.coach_class)
AND NOT EXISTS(SELECT 1 FROM fare_rule f3 WHERE f3.train_type=f.train_type AND f3.coach_class=f.coach_class AND f3.effective_from<=DATE '2026-10-01');
COMMIT;
