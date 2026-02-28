import { useState, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polyline } from 'react-leaflet';
import { Play, Pause } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { NAIROBI_CENTER } from '../data/constants';
import { STATUS, SPECIES_EMOJI } from '../data/constants';

const SPEEDS = [
  { label: '1x', mult: 1 },
  { label: '10x', mult: 10 },
  { label: '100x', mult: 100 },
  { label: '500x', mult: 500 },
];

function PlaybackMapController({ points, currentIndex, animalId }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length || currentIndex < 0) return;
    const p = points[currentIndex];
    map.flyTo([p.lat, p.lng], 15, { duration: 0.3 });
  }, [currentIndex, points, map, animalId]);
  return null;
}

export default function Playback({ animals, movements }) {
  const [selectedId, setSelectedId] = useState(() => animals[0]?.id || '');
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const startTimeRef = useRef(null);
  const startIndexRef = useRef(0);
  const rafRef = useRef(null);

  const points = useMemo(() => {
    if (!selectedId || !movements[selectedId]) return [];
    return movements[selectedId].slice().sort((a, b) => a.timestamp - b.timestamp);
  }, [selectedId, movements]);

  useEffect(() => {
    setCurrentIndex(Math.max(0, points.length - 1));
  }, [selectedId]);

  const currentPoint = points[currentIndex];
  const totalDistance = useMemo(() => {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      d += Math.sqrt((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2) * 111320; // rough meters
    }
    return (d / 1000).toFixed(2);
  }, [points]);

  const hoursInactive = useMemo(() => {
    if (points.length < 2) return '0';
    const now = Date.now();
    const lastTs = points[points.length - 1]?.timestamp || now;
    return ((now - lastTs) / 3600000).toFixed(1);
  }, [points]);

  const anomaliesDetected = useMemo(() => {
    const a = animals.find((x) => x.id === selectedId);
    if (!a) return 0;
    if (a.status === 'urgent' || a.status === 'atRisk') return 1;
    if (a.status === 'monitor') return 1;
    return 0;
  }, [animals, selectedId]);

  useEffect(() => {
    if (!playing || points.length === 0) return;
    const mult = SPEEDS[speedIndex].mult;
    const startWall = Date.now();
    const startTs = points[startIndexRef.current]?.timestamp ?? points[0]?.timestamp;

    const tick = () => {
      const elapsedMs = Date.now() - startWall;
      const elapsedSim = elapsedMs * mult;
      const targetTs = startTs + elapsedSim;
      let idx = startIndexRef.current;
      while (idx < points.length - 1 && points[idx + 1].timestamp <= targetTs) idx++;
      if (idx < points.length && points[idx].timestamp > targetTs) {
        while (idx > 0 && points[idx - 1].timestamp > targetTs) idx--;
      }
      setCurrentIndex(idx);
      if (idx >= points.length - 1) {
        setPlaying(false);
        startTimeRef.current = null;
        startIndexRef.current = points.length - 1;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speedIndex, points]);

  const onPlayPause = () => {
    if (playing) {
      startIndexRef.current = currentIndex;
      setPlaying(false);
    } else {
      startTimeRef.current = null;
      startIndexRef.current = currentIndex;
      setPlaying(true);
    }
  };

  const pathPositions = useMemo(
    () => points.map((p) => [p.lat, p.lng]),
    [points]
  );
  const pastPath = useMemo(
    () => pathPositions.slice(0, currentIndex + 1),
    [pathPositions, currentIndex]
  );

  const animal = animals.find((a) => a.id === selectedId);
  const status = animal ? STATUS[animal.status] || STATUS.healthy : STATUS.healthy;
  const emoji = animal ? SPECIES_EMOJI[animal.species] || '🐄' : '🐄';

  return (
    <div className="screen playback-screen">
      <header className="screen-header">
        <h1>Playback</h1>
      </header>
      <div className="playback-controls">
        <label>
          Animal
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {animals.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.species})</option>
            ))}
          </select>
        </label>
        <div className="playback-buttons">
          <button type="button" className="btn-primary" onClick={onPlayPause}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
            {playing ? ' Pause' : ' Play'}
          </button>
          <div className="speed-selector">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={speedIndex === i ? 'active' : ''}
                onClick={() => setSpeedIndex(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="playback-stats">
        <span>Total distance: <strong>{totalDistance} km</strong></span>
        <span>Hours inactive: <strong>{hoursInactive}h</strong></span>
        <span>Anomalies: <strong>{anomaliesDetected}</strong></span>
      </div>
      <div className="playback-map-wrap">
        <MapContainer
          center={currentPoint ? [currentPoint.lat, currentPoint.lng] : [NAIROBI_CENTER.lat, NAIROBI_CENTER.lng]}
          zoom={15}
          className="playback-map"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <PlaybackMapController points={points} currentIndex={currentIndex} animalId={selectedId} />
          {pathPositions.length > 1 && (
            <>
              <Polyline
                positions={pathPositions}
                pathOptions={{ color: '#2D6A4F', opacity: 0.25, weight: 4 }}
              />
              <Polyline
                positions={pastPath}
                pathOptions={{ color: '#2D6A4F', opacity: 0.8, weight: 5 }}
              />
            </>
          )}
          {currentPoint && (
            <CircleMarker
              center={[currentPoint.lat, currentPoint.lng]}
              radius={12}
              pathOptions={{ fillColor: status.color, color: '#fff', weight: 2, fillOpacity: 0.95 }}
            >
              <Popup>
                <strong>{animal?.name}</strong>
                <br />
                {new Date(currentPoint.timestamp).toLocaleString()}
              </Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>
      <div className="playback-scrubber">
        <input
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={currentIndex}
          onChange={(e) => {
            setCurrentIndex(Number(e.target.value));
            if (playing) {
              startIndexRef.current = Number(e.target.value);
            }
          }}
        />
        <div className="scrubber-labels">
          <span>{points[0] ? new Date(points[0].timestamp).toLocaleTimeString() : '—'}</span>
          <span>{currentPoint ? new Date(currentPoint.timestamp).toLocaleString() : '—'}</span>
          <span>{points[points.length - 1] ? new Date(points[points.length - 1].timestamp).toLocaleTimeString() : '—'}</span>
        </div>
      </div>
    </div>
  );
}
