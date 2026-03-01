export const APP_NAME = 'HerdSense';
export const ONLY_SPECIES = 'Cow';

export const SEX_OPTIONS = ['female', 'male', 'castrated'];
export const PRODUCTION_TYPES = ['dairy', 'beef'];
export const LACTATION_STAGES = ['dry', 'early', 'mid', 'late'];
export const MILKING_FREQUENCIES = ['1x/day', '2x/day', '3x/day'];
export const FEED_INPUT_MODES = ['manual', 'estimated', 'hybrid'];
export const COW_FEED_INPUT_MODES = ['inherit', ...FEED_INPUT_MODES];
export const TASK_CATEGORIES = ['hoof', 'vaccine', 'equipment', 'feeding', 'milking', 'water', 'custom'];
export const VACCINATION_OPTIONS = [
  'BVD',
  'IBR',
  'Clostridial',
  'Leptospirosis',
  'Brucellosis',
  'Foot-and-Mouth',
  'Blackleg',
];

export const STORAGE_KEYS = {
  farmState: 'herdsense_farm_state_v3',
};

export const DEMO_TARGET_EAR_TAG = 'EA-1001';
export const DEMO_FINISH_EAR_TAG = 'EA-1008';
export const DEMO_PLANNING_WHITELIST_TAGS = [DEMO_TARGET_EAR_TAG, DEMO_FINISH_EAR_TAG];

export const STATUS_COLORS = {
  green: '#2D6A4F',
  yellow: '#E9C46A',
  red: '#D62828',
};

export const RISK_BUCKETS = [
  'ILLNESS_OR_INJURY_RISK',
  'PRE_CALVING_RISK',
  'HEAT_STRESS_RISK',
  'WATER_ACCESS_ISSUE',
  'SOCIAL_STRESS',
  'LOW_INTAKE_ANOMALY',
  'NORMAL_VARIATION',
];
