# Run the project

Stop the backend and frontend with Ctrl+C. Start Docker Desktop.
In PowerShell, from the project folder, run each command separately:

```powershell
git pull origin demo/october-2026-actor-fixes
docker compose up -d --wait oracle redis mongo
docker compose stop backend frontend
npm run demo:prepare
```

The first limited-seat update cancels existing active October reservations once.
Their history and audit records remain. Subsequent setup runs preserve bookings.
Keep backend/.env set to Oracle host 127.0.0.1, port 1522, service FREEPDB1.
Run `npm run dev` in backend and in a separate terminal in frontend.
Open http://localhost:5173 and refresh.

# Booking

Use Search for a journey from 1–30 October 2026. Every class has 2 confirmed
seats, 1 RAC place and 5 waiting-list places. For the same train, date and class,
four reservations produce Confirmed, Confirmed, RAC, Waiting list.
In My bookings, cancel a confirmed ticket. Refresh bookings: the RAC ticket is
confirmed and the waiting-list ticket becomes RAC. Cancel another confirmed ticket
to confirm that passenger too. Cancel remaining active tickets to free both seats.

For two passenger accounts, use a regular window for Aarav and an incognito
window for Meera. Staff use their regular dashboards and select the same journey.
