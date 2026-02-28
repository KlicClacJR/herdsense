import { useState, useRef, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Circle } from 'react-leaflet';
import { Clock, AlertTriangle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NAIROBI_CENTER, STATUS, SPECIES_EMOJI, FARM_BOUNDARY_CENTER, FARM_BOUNDARY_RADIUS_M } from '../data/constants';
import FilterBar from './FilterBar';

function MapController({ center, zoomToId, animals, getCurrentPosition }) {
  const map = useMap();
  const prevZoomId = useRef(null);
  if (zoomToId && zoomToId !== prevZoomId.current) {
    prevZoomId.current = zoomToId;
    const pos = getCurrentPosition(zoomToId);
    if (pos) {
      map.flyTo([pos.lat, pos.lng], 16, { duration: 0.8 });
    }
  }
  return null;
}

function HeatLayer({ movements, animals, todayStart }) {
  const map = useMap();
  const heatData = useMemo(() => {
    const points = [];
    animals.forEach((a) => {
      const pts = movements[a.id] || [];
      pts.forEach((p) => {
        if (p.timestamp >= todayStart) {
          points.push([p.lat, p.lng, 0.5]);
        }
      });
    });
    return points;
  }, [movements, animals, todayStart]);

  useEffect(() => {
    if (heatData.length === 0) return undefined;
    let layer;
    let cancelled = false;

    (async () => {
      try {
        if (typeof window !== 'undefined') window.L = L;
        await import('leaflet.heat');
        if (cancelled) return;
        if (!L.heatLayer) return;
        layer = L.heatLayer(heatData, { radius: 35, blur: 25, maxZoom: 17, max: 1 });
        layer.addTo(map);
      } catch {
        // If heat plugin fails to load, silently skip heat layer.
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, heatData]);

  return null;
}

export default function Dashboard({
  animals,
  movements,
  getCurrentPosition,
}) {
  const [zoomToId, setZoomToId] = useState(null);
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'heat'
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const [filters, setFilters] = useState({
    species: 'All',
    sex: 'All',
    status: 'All',
    pregnancy: 'All',
  });

  const filteredAnimals = useMemo(() => {
    return animals.filter((a) => {
      if (filters.species !== 'All' && a.species !== filters.species) return false;
      if (filters.sex !== 'All' && a.sex !== filters.sex) return false;
      if (filters.status !== 'All' && a.status !== filters.status) return false;
      if (filters.pregnancy !== 'All') {
        if (filters.pregnancy === 'Pregnant' && a.pregnancyStatus !== 'Pregnant') return false;
        if (filters.pregnancy === 'Not Pregnant' && a.pregnancyStatus === 'Pregnant') return false;
      }
      return true;
    });
  }, [animals, filters]);

  const hasUrgent = filteredAnimals.some((a) => a.status === 'urgent');
  const brunoOutside = animals.find((a) => a.id === 'bruno');
  const showFarmBoundary = brunoOutside && viewMode === 'live';

  return (
    <div className="screen dashboard-screen">
      <header className="dashboard-header">
        <h1 className="farm-name">Maria&apos;s Farm</h1>
        <div className="live-clock">
          <Clock size={18} />
          <span id="live-clock-text">{clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </header>

      {hasUrgent && (
        <div className="urgent-banner">
          <AlertTriangle size={20} />
          <span>Urgent: One or more animals need immediate attention. Check Alerts.</span>
        </div>
      )}

      <div className="dashboard-map-wrap">
        <MapContainer
          center={[NAIROBI_CENTER.lat, NAIROBI_CENTER.lng]}
          zoom={14}
          className="dashboard-map"
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapController
            center={NAIROBI_CENTER}
            zoomToId={zoomToId}
            animals={filteredAnimals}
            getCurrentPosition={getCurrentPosition}
          />
          {viewMode === 'heat' && (
            <HeatLayer
              movements={movements}
              animals={filteredAnimals}
              todayStart={todayStart}
            />
          )}
          {showFarmBoundary && (
            <Circle
              center={[FARM_BOUNDARY_CENTER.lat, FARM_BOUNDARY_CENTER.lng]}
              radius={FARM_BOUNDARY_RADIUS_M}
              pathOptions={{
                color: '#7B2CBF',
                fill: false,
                weight: 2,
                dashArray: '8,8',
              }}
            />
          )}
          {viewMode === 'live' &&
            filteredAnimals.map((a) => {
              const pos = getCurrentPosition(a.id);
              if (!pos) return null;
              const status = STATUS[a.status] || STATUS.healthy;
              return (
                <CircleMarker
                  key={a.id}
                  center={[pos.lat, pos.lng]}
                  radius={10}
                  pathOptions={{ fillColor: status.color, color: '#fff', weight: 2, fillOpacity: 0.9 }}
                  eventHandlers={{
                    click: () => setZoomToId(a.id),
                  }}
                >
                  <Popup>
                    <strong>{a.name}</strong>
                    <br />
                    Status: {status.label}
                    <br />
                    Confidence: {a.status === 'urgent' ? 94 : a.status === 'atRisk' ? 78 : a.status === 'monitor' ? 65 : 92}%
                  </Popup>
                </CircleMarker>
              );
            })}
        </MapContainer>
        <button
          type="button"
          className="view-toggle"
          onClick={() => setViewMode((m) => (m === 'live' ? 'heat' : 'live'))}
        >
          {viewMode === 'live' ? 'Heat Map' : 'Live View'}
        </button>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} animals={animals} />
      <p className="filter-count">
        Showing {filteredAnimals.length} of {animals.length} animals
      </p>

      <div className="animal-cards-scroll">
        {filteredAnimals.map((a) => {
          const pos = getCurrentPosition(a.id);
          const status = STATUS[a.status] || STATUS.healthy;
          const emoji = SPECIES_EMOJI[a.species] || '🐄';
          const lastTs = movements[a.id]?.length ? movements[a.id][movements[a.id].length - 1]?.timestamp : Date.now();
          return (
            <button
              key={a.id}
              type="button"
              className="animal-card"
              onClick={() => setZoomToId(a.id)}
            >
              <span className="animal-card-emoji">{emoji}</span>
              <div className="animal-card-info">
                <span className="animal-card-name">{a.name}</span>
                <span className="animal-card-status" style={{ background: status.color }}>
                  {status.label}
                </span>
                <span className="animal-card-time">
                  Last activity: {new Date(lastTs).toLocaleTimeString()}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
