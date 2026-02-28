import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, NAIROBI_CENTER } from '../data/constants';
import { getDemoAnimals, getDemoMovements, seedStorageIfNeeded } from '../data/demoData';

const r = (v, range = 0.008) => v + (Math.random() - 0.5) * range;

export function useAnimals() {
  const [animals, setAnimals] = useState([]);
  const [movements, setMovements] = useState({});

  useEffect(() => {
    seedStorageIfNeeded();
    try {
      const a = JSON.parse(localStorage.getItem(STORAGE_KEYS.animals) || '[]');
      setAnimals(Array.isArray(a) ? a : []);
    } catch {
      setAnimals(getDemoAnimals());
    }
    try {
      const m = JSON.parse(localStorage.getItem(STORAGE_KEYS.movements) || '{}');
      setMovements(typeof m === 'object' && m !== null ? m : getDemoMovements());
    } catch {
      setMovements(getDemoMovements());
    }
  }, []);

  useEffect(() => {
    if (animals.length) {
      localStorage.setItem(STORAGE_KEYS.animals, JSON.stringify(animals));
    }
  }, [animals]);

  useEffect(() => {
    if (Object.keys(movements).length) {
      localStorage.setItem(STORAGE_KEYS.movements, JSON.stringify(movements));
    }
  }, [movements]);

  const addAnimal = useCallback((animal) => {
    const id = animal.id || `animal-${Date.now()}`;
    const withId = { ...animal, id };
    setAnimals((prev) => [...prev, withId]);
    setMovements((prev) => {
      const pts = [{ timestamp: Date.now(), lat: NAIROBI_CENTER.lat, lng: NAIROBI_CENTER.lng, steps: 0 }];
      return { ...prev, [id]: pts };
    });
    return id;
  }, []);

  const updateAnimal = useCallback((id, updates) => {
    setAnimals((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const deleteAnimal = useCallback((id) => {
    setAnimals((prev) => prev.filter((a) => a.id !== id));
    setMovements((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const getCurrentPosition = useCallback(
    (animalId) => {
      const pts = movements[animalId];
      if (!pts || pts.length === 0) return null;
      const last = pts[pts.length - 1];
      return { lat: last.lat, lng: last.lng };
    },
    [movements]
  );

  const addMovementPoint = useCallback((animalId, lat, lng, steps = 0) => {
    setMovements((prev) => {
      const pts = prev[animalId] || [];
      const next = [...pts, { timestamp: Date.now(), lat, lng, steps: (pts[pts.length - 1]?.steps || 0) + steps }];
      return { ...prev, [animalId]: next };
    });
  }, []);

  // Simulate movement every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMovements((prev) => {
        const next = { ...prev };
        animals.forEach((a) => {
          const pts = next[a.id] || [];
          const last = pts[pts.length - 1];
          if (!last) return;
          let lat = last.lat;
          let lng = last.lng;
          let steps = last.steps || 0;
          if (a.id === 'luna') {
            lat += (Math.random() - 0.5) * 0.00005;
            lng += (Math.random() - 0.5) * 0.00005;
          } else if (a.id === 'bart') {
            lat = r(lat, 0.0008);
            lng = r(lng, 0.0008);
            steps += 2;
          } else if (a.id === 'maria') {
            lat = r(lat, 0.0015);
            lng = r(lng, 0.0015);
            steps += 12;
          } else {
            lat = r(lat, 0.0025);
            lng = r(lng, 0.0025);
            steps += 25;
          }
          next[a.id] = [...pts, { timestamp: Date.now(), lat, lng, steps }];
        });
        return next;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [animals]);

  return {
    animals,
    setAnimals,
    movements,
    setMovements,
    addAnimal,
    updateAnimal,
    deleteAnimal,
    getCurrentPosition,
    addMovementPoint,
  };
}
