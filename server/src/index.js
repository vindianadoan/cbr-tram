import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import { createRequire } from 'module';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });
const logger = pino({ transport: { target: 'pino-pretty' } });
const app = express();
app.use(cors());

const PORT = process.env.PORT || 4000;
const FEED_TTL_MS = Number(process.env.FEED_TTL_MS || 15000);

// Simple in-memory cache for stops
let stopsCache = null;
let stopsCacheTs = 0;
const STOPS_TTL_MS = 24 * 60 * 60 * 1000;

// In-memory GTFS-RT feed cache
let feedCache = null; // decoded FeedMessage
let feedCacheTs = 0;
let feedCacheRaw = null; // Uint8Array raw bytes

async function loadFeed() {
  const url = process.env.GTFS_RT_TRIP_UPDATES_URL;
  if (!url) return null;
  const now = Date.now();
  if (feedCache && now - feedCacheTs < FEED_TTL_MS) return feedCache;
  const headers = {};
  if (process.env.GTFS_RT_API_KEY) headers['Authorization'] = process.env.GTFS_RT_API_KEY;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GTFS-RT fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  // Save raw file to disk for inspection
  const rawDir = path.join(__dirname, '../tmp');
  await fs.mkdir(rawDir, { recursive: true }).catch(() => {});
  const rawPath = path.join(rawDir, 'lightrail.pb');
  await fs.writeFile(rawPath, Buffer.from(buffer)).catch(() => {});
  // Import bindings via CommonJS require to avoid ESM interop issues
  const require = createRequire(import.meta.url);
  const Gtfs = require('gtfs-realtime-bindings');
  const rt = Gtfs.transit_realtime;
  feedCacheRaw = new Uint8Array(buffer);
  feedCache = rt.FeedMessage.decode(feedCacheRaw);
  feedCacheTs = now;
  return feedCache;
}

// Fallback static stops (id, name) for Canberra Light Rail as a starter
// Replace or augment via STOPS_URL env or GTFS static if available
const fallbackStops = [
  { id: 'GUNGAHLIN_PLACE', name: 'Gungahlin Place' },
  { id: 'MANNING_CLARK', name: 'Manning Clark North' },
  { id: 'KAVANAGH', name: 'Kavanagh Street' },
  { id: 'WIMMERA', name: 'Well Station Drive' },
  { id: 'SANDY', name: 'Sandon Street' },
  { id: 'EPIC', name: 'EPIC and Racecourse' },
  { id: 'SWINDEN', name: 'Swinden Street' },
  { id: 'DICKSON_INTERCHANGE', name: 'Dickson Interchange' },
  { id: 'MACARTHUR', name: 'Macarthur Avenue' },
  { id: 'IPIMA', name: 'Ipima Street' },
  { id: 'ELDER', name: 'Elouera Street' },
  { id: 'ALINGA', name: 'Alinga Street' }
];

async function loadStops() {
  const now = Date.now();
  if (stopsCache && now - stopsCacheTs < STOPS_TTL_MS) return stopsCache;
  // 1) Prefer local GTFS static stops.txt mapping (stop_id -> stop_name)
  try {
    const staticStopsPath = path.join(__dirname, '../cbr-lightrail-concors/stops.txt');
    const csv = await fs.readFile(staticStopsPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const header = lines.shift();
    if (header && header.toLowerCase().startsWith('stop_id')) {
      const rows = lines.map(l => parseCsvLine(l)).filter(r => r && r.length >= 6);
      // Only platform stops (location_type === 0)
      const mapped = rows
        .filter(r => String(stripQuotes(r[5] ?? '0')) === '0')
        .map(r => ({ id: stripQuotes(r[0]), name: stripQuotes(r[1]) }));
      if (mapped.length > 0) {
        stopsCache = mapped;
        stopsCacheTs = now;
        return stopsCache;
      }
    }
  } catch (_e) {}

  // 2) Otherwise derive from cached protobuf if available; otherwise fall back
  try {
    const feed = await loadFeed();
    if (feed) {
      const set = new Set();
      for (const e of feed.entity) {
        if (!e.tripUpdate) continue;
        for (const stu of e.tripUpdate.stopTimeUpdate || []) {
          const sid = stu.stopId || stu.stop_id;
          if (sid) set.add(String(sid));
        }
      }
      const fromFeed = Array.from(set).sort().map(id => ({ id, name: id }));
      if (fromFeed.length > 0) {
        stopsCache = fromFeed;
        stopsCacheTs = now;
        return stopsCache;
      }
    }
  } catch (_e) {}
  stopsCache = fallbackStops;
  stopsCacheTs = now;
  return stopsCache;
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/^"|"$/g, '');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i=0; i<line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Minimal GTFS-RT TripUpdates parsing for next arrivals at a stop (up to two by direction)
// Expect env: GTFS_RT_TRIP_UPDATES_URL, optional GTFS_RT_API_KEY
async function getNextArrivalsForStop(stopId) {
  try {
    const feed = await loadFeed();
    if (!feed) return [];
    const now = Math.floor(Date.now() / 1000);

    const hasTripUpdates = (feed.entity || []).some(e => e.tripUpdate);
    if (!hasTripUpdates) {
      logger.warn('Feed appears not to contain TripUpdates');
      return [];
    }

    // Keep earliest per directionId (0/1). If missing, bucket 'unknown'
    const bestByDir = new Map();
    for (const entity of feed.entity) {
      if (!entity.tripUpdate) continue;
      const dir = entity.tripUpdate.trip?.directionId ?? entity.tripUpdate.trip?.direction_id ?? 'unknown';
      for (const stu of entity.tripUpdate.stopTimeUpdate || []) {
        const sid = stu.stopId || stu.stop_id;
        if (!sid) continue;
        if (String(sid).toUpperCase() !== String(stopId).toUpperCase()) continue;
        const t = stu.arrival?.time?.toNumber?.() ?? stu.arrival?.time ?? null;
        if (!t || t < now) continue;
        const prev = bestByDir.get(dir);
        if (!prev || t < prev) bestByDir.set(dir, t);
      }
    }
    const list = Array.from(bestByDir.entries())
      .map(([directionId, epochSeconds]) => ({
        epochSeconds,
        secondsAway: epochSeconds - now,
        source: 'realtime',
        directionId: directionId === 'unknown' ? undefined : Number(directionId)
      }))
      .filter(x => x.secondsAway >= 0)
      .sort((a,b) => a.secondsAway - b.secondsAway)
      .slice(0,2);
    if (list.length === 0) return [];
    return list;
  } catch (e) {
    logger.error({ err: e }, 'Failed to parse GTFS-RT');
    return [];
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/refresh', async (_req, res) => {
  try {
    feedCache = null; feedCacheTs = 0;
    await loadFeed();
    res.json({ ok: true, refreshedAt: new Date(feedCacheTs).toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// Serve the latest raw protobuf snapshot
app.get('/api/feed.pb', async (_req, res) => {
  try {
    const rawPath = path.join(__dirname, '../tmp/lightrail.pb');
    const data = await fs.readFile(rawPath).catch(() => null);
    if (!data) return res.status(503).send('Feed unavailable');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(data);
  } catch (e) {
    res.status(500).send('Error fetching feed');
  }
});

// JSON sample of first N TripUpdates for quick inspection
app.get('/api/rt-sample', async (req, res) => {
  try {
    const n = Math.max(1, Math.min(50, Number(req.query.n || 5)));
    const feed = await loadFeed();
    if (!feed) return res.json([]);
    const items = [];
    for (const e of feed.entity) {
      if (!e.tripUpdate) continue;
      const tu = e.tripUpdate;
      items.push({
        id: e.id,
        tripId: tu.trip?.tripId ?? tu.trip?.trip_id,
        directionId: tu.trip?.directionId ?? tu.trip?.direction_id,
        stopTimeUpdates: (tu.stopTimeUpdate || []).slice(0,3).map(stu => ({
          stopId: stu.stopId || stu.stop_id,
          arrival: stu.arrival?.time?.toNumber?.() ?? stu.arrival?.time,
          departure: stu.departure?.time?.toNumber?.() ?? stu.departure?.time
        }))
      });
      if (items.length >= n) break;
    }
    res.json(items);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/stops', async (_req, res) => {
  const stops = await loadStops();
  res.json(stops);
});

app.get('/api/stops-full', async (_req, res) => {
  try {
    const staticStopsPath = path.join(__dirname, '../cbr-lightrail-concors/stops.txt');
    const csv = await fs.readFile(staticStopsPath, 'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const header = lines.shift();
    if (!header) return res.json([]);
    const rows = lines.map(l => parseCsvLine(l)).filter(r => r && r.length >= 7);
    const platforms = rows.filter(r => String(stripQuotes(r[5] ?? '0')) === '0');
    const list = platforms.map(r => ({
      id: stripQuotes(r[0]),
      name: stripQuotes(r[1]),
      lat: Number(stripQuotes(r[2])),
      lon: Number(stripQuotes(r[3]))
    }));
    return res.json(list);
  } catch (e) {
    return res.json([]);
  }
});

app.get('/api/vehicles', async (_req, res) => {
  try {
    const feed = await loadFeed();
    if (!feed) return res.json([]);
    const out = [];
    for (const e of feed.entity) {
      if (!e.vehicle) continue;
      const v = e.vehicle;
      const pos = v.position;
      if (!pos) continue;
      out.push({
        id: v.vehicle?.id ?? e.id,
        tripId: v.trip?.tripId ?? v.trip?.trip_id,
        directionId: v.trip?.directionId ?? v.trip?.direction_id,
        lat: pos.latitude,
        lon: pos.longitude,
        bearing: pos.bearing,
        stopId: v.stopId || v.stop_id
      });
    }
    res.json(out);
  } catch (_e) {
    res.json([]);
  }
});

// Debug: expose current stopIds seen in TripUpdates to help align IDs
app.get('/api/rt-stop-ids', async (_req, res) => {
  try {
    const feed = await loadFeed();
    if (!feed) return res.json({ type: 'Unknown', stopIds: [] });
    const type = (feed.entity || []).some(e => e.tripUpdate)
      ? 'TripUpdates'
      : (feed.entity || []).some(e => e.vehicle) ? 'VehiclePositions' : 'Unknown';
    const set = new Set();
    for (const e of feed.entity) {
      if (!e.tripUpdate) continue;
      for (const stu of e.tripUpdate.stopTimeUpdate || []) {
        const sid = stu.stopId || stu.stop_id;
        if (sid) set.add(String(sid));
      }
    }
    res.json({ type, stopIds: Array.from(set).sort() });
  } catch (e) {
    res.json({ type: 'Unknown', stopIds: [] });
  }
});

app.get('/api/departures', async (req, res) => {
  const stopId = String(req.query.stopId || '').trim();
  if (!stopId) return res.status(400).json({ error: 'stopId required' });
  const nexts = await getNextArrivalsForStop(stopId);
  // maintain legacy shape for existing clients
  const next = Array.isArray(nexts) ? (nexts[0] || null) : null;
  res.json({ stopId, next, nexts: Array.isArray(nexts) ? nexts : [] });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${PORT}`);
});

// Basic fallback: assume a train every 6 minutes; compute next minute mark
function getFallbackNextArrivals(stopId) {
  const headwaySeconds = Number(process.env.FALLBACK_HEADWAY_SECONDS || 360);
  const now = Math.floor(Date.now() / 1000);
  // Stable hash-based offset per stop using a windowed schedule
  let hash = 0;
  const key = String(stopId || 'default');
  for (let i = 0; i < key.length; i++) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  const offsetA = hash % headwaySeconds;
  const offsetB = (offsetA + Math.floor(headwaySeconds / 2)) % headwaySeconds;
  const windowStart = Math.floor(now / headwaySeconds) * headwaySeconds;
  function calc(off){
    let target = windowStart + off;
    if (target <= now) target += headwaySeconds;
    const wait = target - now;
    return { epochSeconds: target, secondsAway: wait, source: 'fallback' };
  }
  const a = calc(offsetA);
  const b = calc(offsetB);
  a.directionId = 0;
  b.directionId = 1;
  return [a, b];
}


