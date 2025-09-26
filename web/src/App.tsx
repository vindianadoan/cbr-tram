import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup, LayerGroup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix for default markers in production
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

type Stop = { id: string; name: string }
type Arrival = { epochSeconds: number; secondsAway: number; source?: 'realtime' | 'fallback'; directionId?: number }

function App() {
  const [stops, setStops] = useState<Stop[]>([])
  const [selectedStop, setSelectedStop] = useState<string>('')
  const [targets, setTargets] = useState<Arrival[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [source, setSource] = useState<'realtime' | 'fallback' | undefined>(undefined)
  const [vehicles, setVehicles] = useState<Array<{id:string; lat:number; lon:number; directionId?:number; stopId?:string}>>([])
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number]>([-35.28, 149.13])
  const [mapZoom, setMapZoom] = useState(12)

  useEffect(() => {
    // Try Railway backend first, fallback to local API
    const railwayUrl = import.meta.env.VITE_API_URL
    let apiUrl = railwayUrl || '/api'
    
    // Ensure URL has protocol if it's not a relative path
    if (apiUrl && !apiUrl.startsWith('/') && !apiUrl.startsWith('http')) {
      apiUrl = `https://${apiUrl}`
    }
    
    console.log('Using API URL:', apiUrl)
    
    fetch(`${apiUrl}/api/stops`)
      .then((r) => {
        console.log('Stops response:', r.status, r.statusText)
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then((data) => {
        console.log('Stops data:', data)
        setStops(data)
        if (data && data[0]) setSelectedStop(data[0].id)
      })
      .catch((err) => {
        console.error('Failed to load stops:', err)
        setError(`Failed to load stops: ${err.message}`)
      })
  }, [])


  // Force-refresh vehicle layer when set changes (prevents ghost pins)
  const vehiclesLayerKey = useMemo(() => {
    return vehicles.map(v => v.id).join(',')
  }, [vehicles])

  // Poll vehicle positions every 10s
  useEffect(() => {
    let cancelled = false
    async function loadVehicles(){
      try {
        let apiUrl = import.meta.env.VITE_API_URL || '/api'
        if (apiUrl && !apiUrl.startsWith('/') && !apiUrl.startsWith('http')) {
          apiUrl = `https://${apiUrl}`
        }
        const r = await fetch(`${apiUrl}/api/vehicles`)
        const j = await r.json()
        if (!cancelled) {
          // Clear vehicles first, then set new ones to force re-render
          setVehicles([])
          setTimeout(() => setVehicles(j), 10)
        }
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
      let apiUrl = import.meta.env.VITE_API_URL || '/api'
      if (apiUrl && !apiUrl.startsWith('/') && !apiUrl.startsWith('http')) {
        apiUrl = `https://${apiUrl}`
      }
      const r = await fetch(`${apiUrl}/api/departures?stopId=${encodeURIComponent(stopId)}`)
      const json = await r.json()
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
      {!isMapFullscreen && (
        <>
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
              const selectedStopName = stops.find(s => s.id === selectedStop)?.name || ''
              const dirLabel = selectedStopName.endsWith('1') ? 'To City' : 
                              selectedStopName.endsWith('2') ? 'To Gungahlin' : 
                              'Direction n/a'
              return (
                <div key={i} className="countdown">
                  {loading && targets.length === 0 ? 'Loading…' : formatCountdown(t.epochSeconds)}
                  <div className="dir">
                    {dirLabel} · {t.source === 'realtime' ? 'Live' : 'Fallback'}
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
        </>
      )}
      <div className="map-container" style={{ 
        height: isMapFullscreen ? '100vh' : '420px', 
        marginTop: isMapFullscreen ? 0 : '1.5rem', 
        border: isMapFullscreen ? 'none' : '2px solid #ddd', 
        borderRadius: isMapFullscreen ? 0 : 8, 
        overflow: 'hidden',
        position: isMapFullscreen ? 'fixed' : 'relative',
        top: isMapFullscreen ? 0 : 'auto',
        left: isMapFullscreen ? 0 : 'auto',
        width: isMapFullscreen ? '100vw' : 'auto',
        zIndex: isMapFullscreen ? 1000 : 'auto'
      }}>
        <div className="map-controls" style={{ 
          position: 'absolute', 
          top: '10px', 
          right: '10px', 
          zIndex: 1001,
          display: 'flex',
          gap: '8px'
        }}>
          <button 
            className="btn" 
            onClick={() => setIsMapFullscreen(!isMapFullscreen)}
            style={{ 
              padding: '8px 12px', 
              fontSize: '14px',
              backgroundColor: isMapFullscreen ? '#dc3545' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {isMapFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
        <MapContainer 
          center={mapCenter as any} 
          zoom={mapZoom as any} 
          style={{ height: '100%', width: '100%' }}
          whenCreated={(mapInstance: any) => {
            // Store map instance to preserve state
            mapInstance.on('moveend', () => {
              setMapCenter([mapInstance.getCenter().lat, mapInstance.getCenter().lng])
            })
            mapInstance.on('zoomend', () => {
              setMapZoom(mapInstance.getZoom())
            })
          }}
        >
          <TileLayer
            {...({attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} as any)}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LayerGroup key={vehiclesLayerKey}>
            {vehicles.map(v => (
              <Marker key={`${v.id}-${v.lat}-${v.lon}`} position={[v.lat, v.lon]}>
                <Popup>LRV {v.id} {typeof v.directionId==='number' ? `· dir ${v.directionId}` : ''}</Popup>
              </Marker>
            ))}
          </LayerGroup>
        </MapContainer>
      </div>
    </div>
  )
}

export default App
