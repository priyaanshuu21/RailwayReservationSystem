# Demonstrate from the frontend — no SQL required

## Update once on Windows

Stop the backend and frontend with Ctrl+C. In the project terminal run each line separately:

```powershell
git pull origin demo/october-2026-actor-fixes
docker compose up -d --wait oracle redis mongo
npm run demo:prepare
```

Keep backend/.env on your working host settings (Oracle port 1522 on your laptop).
Start `npm run dev` in backend and another terminal in frontend. Open the frontend
and refresh the browser. No dependency changes are needed for this update.

## Use Live demo, not a large regular train

1. Sign in as Passenger. The landing page is now **Live demonstration**.
2. Leave **Waiting list: 2 seats → third booking waits** selected.
3. Click **Reset practice train to 2 free seats**, then confirm. This cancels
   only active tickets on this practice train, including another practice passenger's
   tickets. Normal train bookings and audit history are kept.
4. Click **Book ticket** three times. Watch the actual statuses:
   - First: **Confirmed**; one seat left.
   - Second: **Confirmed**; zero seats left.
   - Third: **Waiting list**; no seat assigned.
5. Click **Cancel confirmed ticket** on either of your first two rows.
6. The banner names the cancelled PNR and the promoted PNR. The former waiting
   ticket becomes **Confirmed** and receives the released seat. There are still
   zero free seats: the promoted passenger now occupies that seat.
7. Reset the practice train to rehearse again. You do not need to rerun setup.

Say: “Booking uses a PL/SQL procedure and fare function. Cancellation promotes
another passenger in the same transaction. Triggers record related audit events.”

## RAC example

Choose **RAC: 2 seats → third RAC → fourth waiting list** and reset it.
Book four times: **Confirmed, Confirmed, RAC, Waiting list**. Cancel a confirmed
ticket. The RAC ticket becomes Confirmed, and the waiting ticket becomes RAC.
These are actual passengers in each queue, not the remaining queue capacity.

## Two passengers

Use the Passenger quick-login for Aarav in a normal browser window. Open an
Incognito window or another browser and choose **Passenger · Meera Nair**.
Both can open Live demo and see the same board, which refreshes automatically.
Each passenger can cancel only their own confirmed ticket. Reset deliberately
clears the selected shared practice scenario for the next presentation.

## Remaining actors

- **TTE:** select practice train 90001 or 90002 on 28 October, load passengers,
  and mark a confirmed ticket boarded. Say: “A stored procedure saves boarding.”
- **Station Master:** publish a Riverside City notice. Sign in as passenger and
  open Notices. Say: “A procedure publishes it and a trigger records its audit.”
- **Zone Admin:** show the assigned-zone reports. Say: “Views aggregate zone data.”
- **Super Admin:** show all zones and audit/outbox activity. Refresh the materialized
  view. Say: “Database links combine zone data; the materialized view saves a report.”

Oracle stores bookings and payments. Redis caches reference data. MongoDB stores
sensor-reading snapshots. Payments are simulated; no money is transferred.

The automated practice regression is `npm run demo:practice-test`. It resets both
practice trains and checks repeatability with Aarav and Meera. It does not cancel
normal train tickets. Run it separately from a live presentation.
