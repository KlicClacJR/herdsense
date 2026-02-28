import { NAIROBI_CENTER, STORAGE_KEYS } from './constants';

// Initial positions near Nairobi (small random offset)
const r = (v, range = 0.008) => v + (Math.random() - 0.5) * range;

function movementPoint(lat, lng, steps = 0) {
  return { timestamp: Date.now(), lat, lng, steps };
}

export function getDemoAnimals() {
  const base = [
    {
      id: 'stella',
      name: 'Stella',
      species: 'Cow',
      age: 4,
      sex: 'Female',
      weight: 420,
      purchasePrice: 800,
      pregnancyStatus: 'Not Pregnant',
      healthConditions: '',
      vaccinationRecords: [],
      gpsTagId: 'TAG-001',
      purchaseYear: 2021,
      firstYearOnFarm: 2021,
      castrationStatus: 'N/A',
      photoBase64: '',
      notes: 'Primary milk producer.',
      status: 'healthy',
      createdAt: Date.now() - 86400000 * 365 * 3,
    },
    {
      id: 'bart',
      name: 'Bart',
      species: 'Goat',
      age: 2,
      sex: 'Male',
      weight: 45,
      purchasePrice: 120,
      pregnancyStatus: 'N/A',
      healthConditions: '',
      vaccinationRecords: [],
      gpsTagId: 'TAG-002',
      purchaseYear: 2023,
      firstYearOnFarm: 2023,
      castrationStatus: 'Intact',
      photoBase64: '',
      notes: '',
      status: 'atRisk',
      createdAt: Date.now() - 86400000 * 365 * 2,
    },
    {
      id: 'maria',
      name: 'Maria',
      species: 'Sheep',
      age: 3,
      sex: 'Female',
      weight: 55,
      purchasePrice: 150,
      pregnancyStatus: 'Not Pregnant',
      healthConditions: '',
      vaccinationRecords: [],
      gpsTagId: 'TAG-003',
      purchaseYear: 2022,
      firstYearOnFarm: 2022,
      castrationStatus: 'N/A',
      photoBase64: '',
      notes: '',
      status: 'monitor',
      createdAt: Date.now() - 86400000 * 365 * 3,
    },
    {
      id: 'bruno',
      name: 'Bruno',
      species: 'Pig',
      age: 1,
      sex: 'Male',
      weight: 90,
      purchasePrice: 200,
      pregnancyStatus: 'N/A',
      healthConditions: '',
      vaccinationRecords: [],
      gpsTagId: 'TAG-004',
      purchaseYear: 2024,
      firstYearOnFarm: 2024,
      castrationStatus: 'Castrated',
      photoBase64: '',
      notes: '',
      status: 'healthy',
      createdAt: Date.now() - 86400000 * 200,
    },
    {
      id: 'luna',
      name: 'Luna',
      species: 'Cow',
      age: 6,
      sex: 'Female',
      weight: 480,
      purchasePrice: 950,
      pregnancyStatus: 'Pregnant',
      healthConditions: '',
      vaccinationRecords: [],
      gpsTagId: 'TAG-005',
      purchaseYear: 2019,
      firstYearOnFarm: 2019,
      castrationStatus: 'N/A',
      photoBase64: '',
      notes: 'Due to calve soon.',
      status: 'urgent',
      createdAt: Date.now() - 86400000 * 365 * 6,
    },
  ];
  return base;
}

// Generate initial movement history for each animal (last 24h of points every 30 min)
export function getDemoMovements() {
  const now = Date.now();
  const thirtyMin = 30 * 60 * 1000;
  const animals = getDemoAnimals();

  const movements = {};

  animals.forEach((a, i) => {
    const points = [];
    const lat0 = r(NAIROBI_CENTER.lat, 0.012);
    const lng0 = r(NAIROBI_CENTER.lng, 0.012);
    let lat = lat0;
    let lng = lng0;
    let steps = 0;

    // 48 points = 24 hours every 30 min
    for (let t = 48; t >= 0; t--) {
      const ts = now - t * thirtyMin;
      if (a.id === 'luna') {
        // Luna: almost no movement (tiny drift)
        lat += (Math.random() - 0.5) * 0.0001;
        lng += (Math.random() - 0.5) * 0.0001;
      } else if (a.id === 'bart') {
        // Bart: low movement
        lat = r(lat, 0.001);
        lng = r(lng, 0.001);
        steps += 2;
      } else if (a.id === 'maria') {
        lat = r(lat, 0.002);
        lng = r(lng, 0.002);
        steps += 15;
      } else {
        lat = r(lat, 0.003);
        lng = r(lng, 0.003);
        steps += 30;
      }
      points.push({ timestamp: ts, lat, lng, steps });
    }
    movements[a.id] = points;
  });

  // Bruno: last point outside farm boundary for security alert
  const brunoPoints = movements.bruno || [];
  if (brunoPoints.length) {
    const last = brunoPoints[brunoPoints.length - 1];
    // ~1km north of center = outside 800m radius
    movements.bruno = [
      ...brunoPoints.slice(0, -1),
      { ...last, lat: NAIROBI_CENTER.lat + 0.012, lng: last.lng, steps: last.steps },
    ];
  }

  return movements;
}

export function seedStorageIfNeeded() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.animals);
    if (!stored || JSON.parse(stored).length === 0) {
      localStorage.setItem(STORAGE_KEYS.animals, JSON.stringify(getDemoAnimals()));
    }
  } catch (_) {
    localStorage.setItem(STORAGE_KEYS.animals, JSON.stringify(getDemoAnimals()));
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.movements);
    if (!stored || Object.keys(JSON.parse(stored)).length === 0) {
      localStorage.setItem(STORAGE_KEYS.movements, JSON.stringify(getDemoMovements()));
    }
  } catch (_) {
    localStorage.setItem(STORAGE_KEYS.movements, JSON.stringify(getDemoMovements()));
  }

  try {
    if (!localStorage.getItem(STORAGE_KEYS.schedules)) {
      localStorage.setItem(STORAGE_KEYS.schedules, JSON.stringify([]));
    }
  } catch (_) {
    localStorage.setItem(STORAGE_KEYS.schedules, JSON.stringify([]));
  }
}
