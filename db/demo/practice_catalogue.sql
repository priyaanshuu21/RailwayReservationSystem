WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE n NUMBER;
BEGIN
 FOR lab IN 1..2 LOOP
  SELECT COUNT(*) INTO n FROM train WHERE train_id=9000+lab;
  IF n=0 THEN
   INSERT INTO train(train_id,train_type,train_no,train_name)
   VALUES(9000+lab,'E',TO_CHAR(90000+lab),CASE WHEN lab=1 THEN 'Practice: Waiting List' ELSE 'Practice: RAC' END);
   INSERT INTO express_train(train_id,pantry_service,top_speed_kmh) VALUES(9000+lab,'N',100);
   INSERT INTO train_route(train_id,route_id,is_active) VALUES(9000+lab,10,1);
  END IF;
 END LOOP;
 COMMIT;
END;
/
