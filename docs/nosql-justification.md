# Polyglot persistence rationale

RailNexus uses four stores, each for a workload it is actually good at. Nothing is
stored in two places as the source of truth.

## Oracle — system of record

Owns everything transactional and consistency-critical: seat inventory, bookings,
payments, the waitlist queue, and the PL/SQL packages that enforce the rules. Inventory
updates need ACID transactions and row-level locking, which is Oracle's job.

## Redis — cache and coordination

- Availability snapshots (`backend/src/cache/redis.ts`, `cacheKeys`) answer the hottest
  read (`GET /availability`) without touching Oracle every time; TTLs bound staleness.
- A distributed lock (`SET NX PX` + Lua compare-and-delete) guards cross-request
  sections such as materialized-view refresh.
- Degrades to a no-op when `REDIS_ENABLED=false`, so the API runs without Redis.

## MongoDB — telemetry and semi-structured events

- IoT sensor readings are naturally time-series documents (`sensor`, `value`, `status`,
  `alertId`, `ts`). `db/mongo/init-timeseries.mjs` creates a time-series collection;
  ingestion is best-effort so a Mongo outage never blocks a reading.
- Reporting aggregates telemetry with the aggregation pipeline
  (`reportingService.telemetryBySensor`) instead of scanning relational rows.
- The durable outbox / audit trail also lands here for append-only event capture.

Why not put readings in Oracle? Pure append + time-window scans are a poor fit for a
row-store scanned by analytical queries, and the payloads are schema-fluid.

## Choosing per read path

| Query | Store |
|---|---|
| Seat availability | Redis (miss → Oracle) |
| Book / pay / cancel | Oracle (transactional) |
| Train/route metadata | Oracle (cached in Redis) |
| Sensor readings / alerts feed | Oracle zone schema + MongoDB snapshots |
| Revenue / occupancy reports | Oracle views + materialized view |
| Telemetry analytics | MongoDB aggregation |
