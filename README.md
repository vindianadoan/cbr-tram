# cbr-tram

Webapp to display the next Canberra Light Rail service for a selected stop, with a live map of stops and vehicles.

## Getting started

1. Install dependencies

```bash
cd /Users/vincentdoan/repos/cbr-tram
npm install --workspace server
npm install --workspace web
```

2. Configure environment (optional, for real GTFS-RT): create `server/.env`

```bash
GTFS_RT_TRIP_UPDATES_URL=http://files.transport.act.gov.au/feeds/lightrail.pb
# If needed
# GTFS_RT_API_KEY=Bearer <token>
# Optional refresh interval in ms for cached protobuf
# FEED_TTL_MS=15000
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

## API endpoints

- `GET /api/stops` — dropdown list (platform stops when GTFS static present)
- `GET /api/departures?stopId=8129` — next 1–2 arrivals (TripUpdates only)
- `GET /api/stops-full` — stops with lat/lon (for map)
- `GET /api/vehicles` — vehicle positions from cached protobuf
- `POST /api/refresh` — force-refresh protobuf snapshot
- `GET /api/feed.pb` — latest raw protobuf bytes
- `GET /api/rt-sample?n=5` — quick decoded sample

## Notes

- The server caches the protobuf feed for `FEED_TTL_MS` and serves all requests from the cached snapshot.
- Fallback schedule has been removed; if there are no TripUpdates, `nexts` is empty.
- Stop names are loaded from `server/cbr-lightrail-concors/stops.txt` (only `location_type=0` platform stops).
