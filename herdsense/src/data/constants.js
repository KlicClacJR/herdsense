// Find My Animal - HerdSense

export const NAIROBI_CENTER = { lat: 1.2921, lng: 36.8219 };

export const STATUS = {
  healthy: { label: 'Healthy', color: '#2D6A4F', stripe: '#2D6A4F' },
  monitor: { label: 'Monitor', color: '#E9C46A', stripe: '#E9C46A' },
  atRisk: { label: 'At Risk', color: '#E76F51', stripe: '#E76F51' },
  urgent: { label: 'Urgent', color: '#D62828', stripe: '#D62828' },
  security: { label: 'Security Alert', color: '#7B2CBF', stripe: '#7B2CBF' },
};

export const SPECIES = ['Cow', 'Goat', 'Sheep', 'Pig', 'Chicken', 'Horse'];
export const SPECIES_EMOJI = {
  Cow: '🐄',
  Goat: '🐐',
  Sheep: '🐑',
  Pig: '🐷',
  Chicken: '🐔',
  Horse: '🐴',
};

export const PREGNANCY_OPTIONS = ['Not Pregnant', 'Pregnant', 'Unknown'];
export const CASTRATION_OPTIONS = ['Intact', 'Castrated', 'N/A'];

export const STORAGE_KEYS = {
  animals: 'herdsense_animals',
  movements: 'herdsense_movements',
  schedules: 'herdsense_schedules',
};

// Farm boundary for demo (circle around Nairobi - Bruno "outside" for security alert)
export const FARM_BOUNDARY_CENTER = { lat: 1.2921, lng: 36.8219 };
export const FARM_BOUNDARY_RADIUS_M = 800;
