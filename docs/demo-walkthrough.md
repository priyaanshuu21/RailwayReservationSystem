# RailNexus demonstration: five actors and real database transactions

The demonstration runs **1 October 2026 through 30 October 2026, inclusive**.
Six passenger services run every day (180 passenger journeys); freight is excluded
from passenger search. Trains serve their listed stops, so an arbitrary reverse or
unconnected station pair can still correctly have no service.

| Train | From | To | Classes |
|---|---|---|---|
| 10001 City Rajdhani Express | Northvale Junction (101) | Southbay City (301) | SL, 3A, 2A, 1A |
| 10002 Twilight Express | Westport Central (201) | Tamarind Hill (303) | SL, 3A, 2A, 1A |
| 12001 Coastal Superfast | Suncoast (203) | Riverside City (103) | SL, 3A, 2A, 1A |
| 12002 Sirocco Superfast | Greenpeak (102) | Mercantile Docks (302) | SL, 3A, 2A, 1A |
| 13001 Ghat Passenger | Westport Central (201) | Sandalwood City (202) | 2S |
| 13002 Market Local | Southbay City (301) | Tamarind Hill (303) | 2S |

## Prepare and start

Use the existing checkout. Node 20+ and the Oracle, Redis and Mongo containers
must be available. In the prepared cloud environment:

```bash
cd /workspace/RailwayReservationSystem
# Preserve the cloud override if it exists: it supplies Oracle's local TNS alias.
docker compose -f docker-compose.yml -f .agent/tmp/cloud-compose.yml up -d --wait oracle redis mongo
npm run demo:prepare
# Terminal 1:
cd backend
npm run dev
# Terminal 2, from the repository:
cd frontend
npm run dev
```

On another Docker installation, use `docker compose up -d --wait oracle redis mongo`
and the normal local database connection settings in `backend/.env`. The setup
command applies procedures, adds missing October journeys/inventory, seeds real
bookings/payments, creates the reporting views, and publishes an example notice.
It is repeatable and preserves existing bookings. It does **not** restore cancelled
demo tickets: rehearse with the ordinary classes and save the 20 October 1A example
for the presentation. Never reset the database just to repeat a demonstration.

`npm run demo:verify` runs real HTTP/Oracle regression checks. It creates and
cancels its own tickets on 29 and 30 October, publishes a one-hour test notice,
and creates/acknowledges a sensor alert. It leaves audit/refund history for those
operations. Run it serially, before an audience starts making reservations.
Override the API address with `DEMO_API_URL` when using another port.

The seed adds at least 540 captured demo payments across all three zones, with
30 days of synthetic revenue history. No money is transferred: payment capture
is a database simulation, without a payment gateway.

## Accounts and responsibilities

All seeded passwords are `Demo@123`. Use Quick Demo Sign-In on the login page.
Use separate browser profiles or sign out before changing actors.

| Actor | Account | Landing page | Demonstration |
|---|---|---|---|
| Passenger | passenger@railnexus.local | Search | Reserve, choose berth preference, demo payment, My bookings/PNR, cancel, read Notices |
| TTE | tte@railnexus.local | TTE console | Assigned-zone journey dropdown, passenger manifest, mark boarded, safety alerts |
| Station master | station@railnexus.local | Station desk | Riverside City departures and station announcement publishing |
| Zone administrator | zoneadmin@railnexus.local | Zone dashboard | Northern Railway reports and announcements for northern stations |
| Super administrator | admin@railnexus.local | System dashboard | All three zones, procedure audit, outbox trigger events, MV refresh, announcements |

Passengers cannot open staff alerts or staff APIs. The zone administrator's scope
comes from the database assignment, not a browser-selected zone. The station
master can publish only for Riverside City (103); super administrators can publish
for any station. Announcements are passenger-facing; sensor alerts are staff-facing.

## Suggested 10-minute presentation

### 1. Search and confirmed reservation

1. Passenger: search Northvale Junction → Southbay City on **28 October 2026**.
2. Select train **10001**, coach **SL**, berth preference **Lower**.
3. Reserve. Show the generated PNR, assigned coach/seat/berth and calculated fare.
   A berth preference is honored when available and is not a guarantee.
4. Use UPI `demo@upi` and **Pay demo fare**. Card and Wallet are also simulated.
5. Open **My bookings / PNR**, select this ticket, and show the saved details.

Explain `pkg_booking.book_ticket`, `pkg_fare.compute_fare`, `pkg_rules`, row locking,
foreign keys, ticket subtype tables, and payment specialization. The booking
procedure commits the reservation as one transaction and rolls back on failure.

### 2. Waiting list and cancellation (the small compartment)

1. Passenger: open **My bookings / PNR** and set **Show bookings** to
   **20 October · 1A waiting-list demo**. This isolates train 10001’s presentation tickets.
2. The fixture starts with **two confirmed seats and one WL ticket**. One confirmed
   ticket and the waiting ticket belong to the quick-login passenger; the other
   confirmed ticket belongs to Meera. No RAC quota is used in this small example,
   making the direct WL → CFM change easy to see.
3. Look up the WL ticket: status **WL**, queue position **1**, seat pending.
4. Select the passenger's **CFM** ticket for that date/class and **Cancel booking**.
5. Show the actual paid-fare refund request. Select the former WL ticket again:
   it is now **CFM**, with the released seat and berth assigned automatically.
6. Refresh availability: the promoted passenger occupies the released seat; it
   must not simultaneously appear as a free seat.

Explain `pkg_booking.cancel_ticket`: it locks the same schedule as booking,
updates the cancelled ticket, creates a refund request only for a captured
payment, and promotes the FIFO queue in the same transaction. In regular classes
RAC has priority; a vacated RAC slot promotes the next WL passenger to RAC.
Refunds here are recorded requests, not real bank transfers.

### 3. TTE manifest and boarding

1. Sign in as **TTE**. Select **20 October · 10001** in the journey dropdown.
   The numeric schedule ID and owning zone are shown; no SQL ID guessing is needed.
2. **Load passengers**. Show coach/seat/status and mark a confirmed passenger
   **Board**. Reload to demonstrate that the boarded status is stored.
3. Open **Staff alerts**. Select a **TEMP** sensor from the dropdown. Enter **30**
   for a normal reading, then **60** for a critical alert. Acknowledge that alert.

Explain `pkg_tte.board_ticket`, the `confirmed_ticket` boarding fields,
`pkg_iot.ingest_reading`, threshold classification and Mongo time-series storage.
A TTE cannot operate on a journey outside the assigned northern zone.

### 4. Station master announcement → passenger notice

1. Sign in as **Station Master**: the page is a station desk, not a TTE console.
2. Choose **Riverside City**, enter “Train 12001 arrives on platform 2. Please stand
   behind the yellow line.” Set a lifetime of 24 hours, then **Publish announcement**.
3. In a passenger profile, open **Notices**, then **Refresh notices**. Show the same
   station, text and author.

Explain `pkg_announcements.publish`, database-side role/station validation,
`trg_ann_bi` for generated IDs, and `trg_announcement_audit` for publication history.

### 5. Zone administrator versus super administrator

1. Zone admin: show Northern Railway's populated bookings, revenue, waiting-list
   counts and occupancy. Use **Refresh live reports** after a reservation/cancellation.
2. Super admin: show **all three zones**, the procedure/trigger audit table and
   per-zone outbox counts. Recent events include `TICKET_BOOKED`,
   `PAYMENT_CAPTURED`, `TICKET_CANCELLED`, and `TICKET_PROMOTED`.
3. Click **Refresh reporting materialized view** and explain
   `pkg_reporting.refresh_materialized` / `DBMS_MVIEW.REFRESH`.

Live reports aggregate the authoritative zone schemas using database links.
The materialized revenue view is a separate snapshot and is refreshed on demand.
The zone administrator cannot invoke the system-wide refresh operation.

## SQL evidence for a viva

Run [db/demo/verify.sql](../db/demo/verify.sql) as `RAILNEXUS` (using the configured
local connection). Read-only queries show all 30 dates, bookings in each zone,
queue transitions, cancellation/refund history, trigger-generated outbox events,
and announcement audit rows. To inspect PL/SQL source, show:

- `db/plsql/pkg_booking.sql`: availability, reserve, cancel, queue promotion.
- `db/plsql/pkg_payment.sql`: payment specialization and idempotency.
- `db/plsql/outbox_audit_trigger.sql`: audit → outbox in the same transaction.
- `db/plsql/pkg_announcements.sql`: publish procedure and announcement audit trigger.
- `db/reporting/report_views.sql`: federation with `UNION ALL`, joins, aggregation,
  and the on-demand materialized view.

PNRs use zone prefixes (`NR`, `WR`, `SR`) so tickets from different schema-local
sequences cannot accidentally collide. Statuses: **CFM** confirmed, **RAC** shared
reservation pending a full berth, **WL** waiting list, **CNL** cancelled.
