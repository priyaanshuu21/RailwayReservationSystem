-- =============================================================================
-- RailNexus - zone_synonyms.sql (zone_common)
-- Zone schemas own the fragmented booking family; they read reference data from
-- the shared RAILNEXUS schema through synonyms. This keeps a single source of
-- truth for stations, trains, routes, people and fare rules while seat and
-- booking rows live where the train originates.
-- =============================================================================

CREATE OR REPLACE SYNONYM zone FOR railnexus.zone;
CREATE OR REPLACE SYNONYM station FOR railnexus.station;
CREATE OR REPLACE SYNONYM train FOR railnexus.train;
CREATE OR REPLACE SYNONYM express_train FOR railnexus.express_train;
CREATE OR REPLACE SYNONYM superfast_train FOR railnexus.superfast_train;
CREATE OR REPLACE SYNONYM passenger_train FOR railnexus.passenger_train;
CREATE OR REPLACE SYNONYM freight_train FOR railnexus.freight_train;
CREATE OR REPLACE SYNONYM train_route FOR railnexus.train_route;
CREATE OR REPLACE SYNONYM route FOR railnexus.route;
CREATE OR REPLACE SYNONYM station_route FOR railnexus.station_route;
CREATE OR REPLACE SYNONYM person FOR railnexus.person;
CREATE OR REPLACE SYNONYM passenger FOR railnexus.passenger;
CREATE OR REPLACE SYNONYM employee FOR railnexus.employee;
CREATE OR REPLACE SYNONYM tte_conductor FOR railnexus.tte_conductor;
CREATE OR REPLACE SYNONYM station_master FOR railnexus.station_master;
CREATE OR REPLACE SYNONYM zone_admin FOR railnexus.zone_admin;
CREATE OR REPLACE SYNONYM super_admin FOR railnexus.super_admin;
CREATE OR REPLACE SYNONYM fare_rule FOR railnexus.fare_rule;
CREATE OR REPLACE SYNONYM tte_assignment FOR railnexus.tte_assignment;