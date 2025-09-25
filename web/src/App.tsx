import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Stop = { id: string; name: string }
type Arrival = { epochSeconds: number; secondsAway: number; source?: 'realtime' | 'fallback'; directionId?: number }
type NextResponse = { next?: Arrival; nexts?: Arrival[] }

function App() {
  const [stops, setStops] = useState<Stop[]>([])
  const [selectedStop, setSelectedStop] = useState<string>('')
  const [targets, setTargets] = useState<Arrival[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [source, setSource] = useState<'realtime' | 'fallback' | undefined>(undefined)
  const [stopsFull, setStopsFull] = useState<Array<{id:string; name:string; lat:number; lon:number}>>([])
  const [vehicles, setVehicles] = useState<Array<{id:string; lat:number; lon:number; directionId?:number; stopId?:string}>>([])

  useEffect(() => {
    fetch('/api/stops')
      .then((r) => r.json())
      .then((data) => {
        setStops(data)
        if (data && data[0]) setSelectedStop(data[0].id)
      })
      .catch(() => setError('Failed to load stops'))
  }, [])

  // Load map data (stops with coords) once
  useEffect(() => {
    fetch('/api/stops-full').then(r=>r.json()).then(setStopsFull).catch(()=>{})
  }, [])

  // Poll vehicle positions every 10s
  useEffect(() => {
    let cancelled = false
    async function loadVehicles(){
      try {
        const r = await fetch('/api/vehicles')
        const j = await r.json()
        if (!cancelled) setVehicles(j)
      } catch{}
    }
    loadVehicles()
    const id = setInterval(loadVehicles, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  async function fetchDeparturesFor(stopId: string, { showLoading = true } = {}) {
    if (!stopId) return
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/departures?stopId=${encodeURIComponent(stopId)}`)
      const json: NextResponse = await r.json()
      const list = (json?.nexts ?? (json?.next ? [json.next] : [])) as Arrival[]
      setTargets(list)
      setSource(list[0]?.source)
      setLastUpdated(Math.floor(Date.now() / 1000))
    } catch (e) {
      setError('Failed to load departures')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedStop) return
    let cancelled = false
    // initial immediate fetch
    fetchDeparturesFor(selectedStop)
    // background poll to keep fresh
    const id = setInterval(() => {
      if (!cancelled) fetchDeparturesFor(selectedStop, { showLoading: false })
    }, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [selectedStop])

  // Re-fetch when tab gains focus
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && selectedStop) {
        fetchDeparturesFor(selectedStop, { showLoading: false })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [selectedStop])

  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  function formatCountdown(epoch?: number){
    if (!epoch) return '--'
    const diff = epoch - now
    if (diff <= 0) return 'Due'
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">Canberra Metro</div>
        <div className="title">Next Light Rail</div>
      </header>
      <main className="main">
        <label className="label" htmlFor="stop-select">Select stop</label>
        <select
          id="stop-select"
          className="select"
          value={selectedStop}
          onChange={(e) => {
            const id = e.target.value
            setSelectedStop(id)
            // immediate fetch on change
            fetchDeparturesFor(id)
          }}
        >
          {stops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="actions">
          <button className="btn" onClick={() => selectedStop && fetchDeparturesFor(selectedStop)} disabled={!selectedStop || loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {lastUpdated && (
            <span className="updated">Updated {new Date(lastUpdated * 1000).toLocaleTimeString()}</span>
          )}
        </div>
        {error ? (
          <div className="countdown">{error}</div>
        ) : (
          <div className="countdowns">
            {targets.slice(0,2).map((t, i) => {
              const dirLabel = t.directionId === 0 ? 'to City' : t.directionId === 1 ? 'to Gungahlin' : undefined
              return (
                <div key={i} className="countdown">
                  {loading && targets.length === 0 ? 'Loading…' : formatCountdown(t.epochSeconds)}
                  <div className="dir">
                    {dirLabel || 'Direction n/a'} · {t.source === 'realtime' ? 'Live' : 'Fallback'}
                  </div>
                </div>
              )
            })}
            {targets.length === 0 && (
              <div className="countdown">{loading ? 'Loading…' : '--'}</div>
            )}
          </div>
        )}
        <div className="hint">{source === 'realtime' ? 'Live data' : 'Estimated (fallback)'} · Auto-refresh every 15 seconds</div>
      </main>
      <div style={{ height: '420px', marginTop: '1.5rem', border: '2px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
        <MapContainer center={[-35.28,149.13]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {stopsFull.map(s => (
            <Marker key={s.id} position={[s.lat, s.lon]}>
              <Popup>{s.name} ({s.id})</Popup>
            </Marker>
          ))}
          {vehicles.map(v => (
            <Marker key={v.id} position={[v.lat, v.lon]}>
              <Popup>LRV {v.id} {typeof v.directionId==='number' ? `· dir ${v.directionId}` : ''}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}

export default App
