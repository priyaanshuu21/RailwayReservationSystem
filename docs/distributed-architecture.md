# Phase 2: Distributed architecture

RailNexus demonstrates horizontal fragmentation across three logical zone
databases. On this development box all three live as schemas in **one** Oracle
instance; the "distribution" is modelled with DB links, exactly as a real
deployment would work when each zone moves onto its own node.

## Layout

| Schema           | Role                                     |
| ---------------- | ---------------------------------------- |
| `RAILNEXUS`      | Shared reference data + ledger/outbox    |
| `RAILNEXUS_NORTH`| Owns records for zone NR origin trains   |
| `RAILNEXUS_WEST` | Owns records for zone WR origin trains   |
| `RAILNEXUS_SOUTH`| Owns records for zone SR origin trains   |

Fragmenting rule: **a schedule and its coach/seat/segment inventory live in the
zone schema of the train's origin station.** Reference data (station, train,
route, person, fare) stays in the shared schema and is readable from every zone
via the `zone_synonyms.sql` synonyms.

## DB links (`db/distributed/db_links.sql`)

- `ZONE_NORTH/WEST/SOUTH` created in `RAILNEXUS` and between the zones, over the
  local service (`&DB_SERVICE`, default `FREEPDB1`; local XE uses `XE`).
- Links to a *remote* service are the only change needed when zones move onto
  dedicated instances.

## Federated views (`db/distributed/distributed_views.sql`)

Created in the shared schema, each reading the zone fragments through the links:

- `vw_all_zone_schedules` — every train/journey across all zones (UNION ALL).
- `vw_zone_inventory`, `vw_zone_coaches` — coach/seats roll-up per zone.
- `vw_train_catalog` — the find-trains query: shared train/route/station joined
  with the federated schedules.

## Cross-zone booking (`db/distributed/book_cross_zone_ticket.sql`)

`pkg_cross_zone.book_cross_zone_ticket` picks a free seat in the booking's home
zone over a DB link, writes the booking/ticket ledger in the shared schema, and
writes seat occupancy **back to the owning zone** through the link. `demo_...`
books train 1 from Northvale (NR, stop 1) to Southbay (SR, stop 6).

On one instance both legs commit in a single local transaction; on real remote
zones the same seam becomes a distributed (two-phase commit) transaction. Row
locking across remote links is unsupported by Oracle, so the production build
does the `FOR UPDATE SKIP LOCKED` selection inside the distributed transaction.

## Server side

`backend/src/db/zoneRouter.ts` maps any station/zone id to its owning schema and
lazily creates one connection pool per zone (`withZoneConnection`), so API
handlers query exactly the zone that owns the requested inventory.

## Verification

- Backend: `npm run typecheck`, `npm run lint`, `npm test` — green here.
- Oracle: not runnable locally (`OracleServiceXE` stopped, no Docker, no admin
  elevation). The SQL above is design-reviewed only; run `scripts/dev-setup.mjs`
  (or the manifest loader) once an Oracle instance is reachable.