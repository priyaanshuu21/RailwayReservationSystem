# Reporting architecture (OLTP vs OLAP)

## Separation

The transactional path (booking, payment, boarding) must stay small and fast, so
analytical work is isolated behind read-only views rather than being mixed into the
booking tables' access patterns.

- **OLTP objects**: `booking`, `payment`, `ticket`, `seat`, `waitlist_queue` — many small
  indexed reads/writes, row locking.
- **OLAP objects** (`db/reporting/report_views.sql`, applied to the shared schema):
  - `vw_revenue_daily` — captured payments grouped by day.
  - `vw_zone_summary` — bookings, gross fare, confirmed/waitlisted per zone.
  - `vw_occupancy_by_schedule` — seat occupancy percentage per schedule/class.
  - `vw_waitlist_pressure` — RAC/WL depth per schedule/class.
  - `vw_route_popularity` — bookings and revenue per route.
  - `mv_revenue_by_train` — a **materialized view** (`REFRESH COMPLETE ON DEMAND`)
    pre-computing revenue per train, refreshed via `pkg_reporting.refresh_materialized`.

## Why a materialized view

`mv_revenue_by_train` joins the largest tables across the whole federation. Recomputing
it on every dashboard load would be wasteful, so it is materialised and refreshed on a
schedule (or on demand by an admin through `POST /api/reporting/refresh`, role-gated to
`zone_admin`/`super_admin`). This models the classic OLTP → ETL → OLAP boundary inside a
single Oracle instance.

## Access layer

`backend/src/reporting/reportingService.ts` reads the views through the shared pool and
exposes them under `/api/reporting/*`:

| Endpoint | Source |
|---|---|
| `GET /api/reporting/revenue?from&to` | `vw_revenue_daily` |
| `GET /api/reporting/revenue/by-train` | `mv_revenue_by_train` |
| `GET /api/reporting/zones` | `vw_zone_summary` |
| `GET /api/reporting/occupancy?limit` | `vw_occupancy_by_schedule` |
| `GET /api/reporting/waitlist` | `vw_waitlist_pressure` |
| `GET /api/reporting/routes` | `vw_route_popularity` |
| `GET /api/reporting/telemetry?zoneCode` | MongoDB aggregation |

The React `ReportingPage` renders these as bar/table summaries for admin roles.

## Degradation

If Oracle is unavailable the read endpoints surface a clear error rather than fabricating
numbers; the telemetry endpoint returns an empty list when MongoDB is disabled.
