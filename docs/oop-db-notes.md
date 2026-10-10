# Object-relational notes

Relational tables model the transactional core (inventory, bookings, payments).
Two areas genuinely benefit from Oracle's object-relational extensions, so they use
them deliberately rather than for decoration.

## Journey object model

- `db/or/route_journey_types.sql` defines `t_stop`, `t_stop_list` (a nested table) and
  `t_journey` (an object with a nested stop list and a `MEMBER FUNCTION` that computes
  duration).
- `db/or/route_journey_tab.sql` stores one row per route in an object table so the stop
  list travels as a single typed value instead of a child table of rows.
- `db/or/pkg_journey.sql` traverses the nested collection with `TABLE(...)` and returns
  ordered stops — REF navigation and collection unnesting in practice.

Why: a route's ordered stop list is naturally a value object. Storing it as a nested
table keeps the whole route atomic (one insert, one read) and lets PL/SQL iterate it
without joins.

## Where we stayed relational

Seat inventory, bookings and payments stay in classic normalised tables because they are
written concurrently, range-queried and joined heavily — exactly the workload where
object types hurt (harder indexing, awkward bulk DML, opaque plans).

## REF navigation

`pkg_journey` and the distributed views demonstrate `REF`/dereference access so the EER
"object identifier" concept maps to real DDL, but no business-critical path depends on it.
