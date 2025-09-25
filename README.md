# cbr-tram

Webapp to display the next Canberra Light Rail service for a selected stop.

## Getting started

1. Install dependencies

```bash
cd /Users/vincentdoan/repos/cbr-tram
npm install --workspace server
npm install --workspace web
```

2. Configure environment (optional, for real GTFS-RT): create `server/.env`

```bash
GTFS_RT_TRIP_UPDATES_URL=<gtfs-rt trip updates url>
# If needed
# GTFS_RT_API_KEY=Bearer <token>
# Optional stops list JSON url returning [{id,name}]
# STOPS_URL=<https url>
```

3. Run the app

```bash
# Terminal 1
node server/src/index.js

# Terminal 2
cd web && npm run dev
```

Open `http://localhost:5173`.

The frontend proxies `/api/*` to `http://localhost:4000` during development.
