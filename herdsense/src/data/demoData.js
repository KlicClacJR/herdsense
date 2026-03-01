import {
  DEMO_FINISH_EAR_TAG,
  DEMO_PLANNING_WHITELIST_TAGS,
  DEMO_TARGET_EAR_TAG,
  STORAGE_KEYS,
  VACCINATION_OPTIONS,
} from './constants';
import { hashString, seededBetween, seededChoice, seededUnit } from '../utils/seed';
import { formatDateOnly, projectTemplateOccurrences } from '../engines/calendarEngine';
import { sanitizeSignalRecord, sanitizeSignalSeries } from '../utils/signalSanitizer';

const HISTORY_DAYS = 30;
const DEFAULT_DEMO_COWS = 10;
const DEMO_TARGET_TAG = DEMO_TARGET_EAR_TAG; // Willow
const DEMO_FINISH_TAG = DEMO_FINISH_EAR_TAG; // Fern

const COW_NAMES = [
  'Willow',
  'Maple',
  'Clover',
  'Ivy',
  'Hazel',
  'Daisy',
  'Juniper',
  'Fern',
  'Luna',
  'Rosie',
];

function startOfDay(offset = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function dateISO(offset = 0) {
  return startOfDay(offset).toISOString();
}

function defaultMilkByType(cow) {
  if (cow.production_type !== 'dairy') return null;
  return Number(seededBetween(hashString(`${cow.ear_tag_id}-milk`), 16.5, 30.2).toFixed(1));
}

function createDemoCow(index) {
  const seed = hashString(`cow-${index}`);
  const production_type = index < Math.ceil(DEFAULT_DEMO_COWS * 0.62) ? 'dairy' : 'beef';
  const sex = index % 5 === 4 ? 'male' : 'female';
  const lactation_stage =
    production_type === 'dairy' && sex === 'female'
      ? seededChoice(['early', 'mid', 'late', 'dry'], seed + 8)
      : null;

  const age = Number(seededBetween(seed + 9, 2.1, 8.7).toFixed(1));
  const dobOffsetDays = Math.round(age * 365.25 + seededBetween(seed + 10, -120, 120));
  const dateOfBirth = startOfDay(-Math.max(0, dobOffsetDays)).toISOString().slice(0, 10);
  const dueDays =
    sex === 'female' && seededUnit(seed + 12) > 0.35
      ? Math.round(seededBetween(seed + 13, 8, 240))
      : null;

  const beefIndex = Math.max(0, index - Math.ceil(DEFAULT_DEMO_COWS * 0.62));
  const plannedCull =
    production_type === 'beef'
      ? (
        beefIndex === 0
          ? startOfDay(22).toISOString()
          : beefIndex === 1
            ? startOfDay(88).toISOString()
            : seededUnit(seed + 21) > 0.45
              ? startOfDay(Math.round(seededBetween(seed + 22, 125, 210))).toISOString()
              : null
      )
      : (
        index === 1
          ? startOfDay(60).toISOString()
          : null
      );

  const feedModeSeed = seededUnit(seed + 70);
  const feed_intake_mode = feedModeSeed > 0.72 ? 'manual' : feedModeSeed > 0.44 ? 'hybrid' : 'inherit';
  const manualFeed =
    feed_intake_mode === 'manual' || (feed_intake_mode === 'hybrid' && seededUnit(seed + 71) > 0.5)
      ? Number(seededBetween(seed + 72, production_type === 'dairy' ? 17.2 : 10.6, production_type === 'dairy' ? 24.8 : 15.4).toFixed(1))
      : null;
  const expectedSaleValue =
    production_type === 'beef' && plannedCull
      ? Number(seededBetween(seed + 73, 880, 1460).toFixed(0))
      : null;

  return {
    cow_id: `cow-${index + 1}`,
    ear_tag_id: `EA-${String(1001 + index)}`,
    ear_tag_color: seededChoice(['yellow', 'orange', 'blue', 'green', 'white'], seed + 5),
    name: COW_NAMES[index] || `Cow ${index + 1}`,
    production_type,
    sex,
    date_of_birth: dateOfBirth,
    age_years: age,
    lactation_stage,
    pregnancy_due_days: dueDays,
    pregnancy_due_date: dueDays != null ? startOfDay(dueDays).toISOString() : null,
    vaccination_status: VACCINATION_OPTIONS.filter((_, vaccineIdx) => seededUnit(seed + vaccineIdx * 17) > 0.44),
    notes: '',
    weight_kg: Number(seededBetween(seed + 30, production_type === 'dairy' ? 430 : 470, production_type === 'dairy' ? 680 : 760).toFixed(0)),
    planned_cull_or_sale_date: plannedCull,
    target_weight_or_goal: seededUnit(seed + 31) > 0.7 ? `${Math.round(seededBetween(seed + 32, 540, 700))}kg target` : null,
    feed_intake_mode,
    manual_feed_kg_per_day: manualFeed,
    expected_sale_value: expectedSaleValue,
    is_active: true,
  };
}

function buildBaseTaskTemplates(cows, settings) {
  const hoofTrimWeeks = Math.min(10, Math.max(6, Number(settings?.hoof_trim_interval_weeks || 8)));
  const waterDays = Math.min(3, Math.max(2, Number(settings?.water_clean_interval_days || 3)));
  const templateBase = [
    {
      template_id: 'tmpl-hoof-check',
      title: 'Hoof check (light)',
      category: 'hoof',
      start_date: formatDateOnly(startOfDay(1)),
      recurrence: { every: 14, unit: 'days' },
      default_time: '09:00',
      assigned_to: null,
      notes: 'Quick gait and hoof condition pass.',
    },
    {
      template_id: 'tmpl-hoof-trim',
      title: 'Hoof trimming cycle',
      category: 'hoof',
      start_date: formatDateOnly(startOfDay(10)),
      recurrence: { every: hoofTrimWeeks, unit: 'weeks' },
      default_time: '10:00',
      assigned_to: null,
      notes: 'Configurable between 6-12 weeks by herd condition.',
    },
    {
      template_id: 'tmpl-camera-clean',
      title: 'Clean feeder camera lens',
      category: 'equipment',
      start_date: formatDateOnly(startOfDay(1)),
      recurrence: { every: 7, unit: 'days' },
      default_time: '07:30',
      assigned_to: null,
      notes: '',
    },
    {
      template_id: 'tmpl-water-clean',
      title: 'Check and clean water trough',
      category: 'water',
      start_date: formatDateOnly(startOfDay(1)),
      recurrence: { every: waterDays, unit: 'days' },
      default_time: '06:45',
      assigned_to: null,
      notes: '',
    },
    {
      template_id: 'tmpl-feeder-check',
      title: 'Check feeder condition',
      category: 'feeding',
      start_date: formatDateOnly(startOfDay(1)),
      recurrence: { every: 7, unit: 'days' },
      default_time: '08:00',
      assigned_to: null,
      notes: 'Check feeder wear, blockages, and access space.',
    },
  ];

  const vaccineTemplates = cows
    .filter((cow) => cow.vaccination_status.length > 0)
    .map((cow) => ({
      template_id: `tmpl-vaccine-${cow.cow_id}`,
      title: `Vaccination booster review (${cow.name || cow.cow_id})`,
      category: 'vaccine',
      start_date: formatDateOnly(startOfDay(Math.round(seededBetween(hashString(cow.cow_id), 15, 45)))),
      recurrence: { every: 6, unit: 'months' },
      default_time: '11:00',
      assigned_to: cow.cow_id,
      notes: `Vaccines on file: ${cow.vaccination_status.join(', ')}`,
    }));

  return [...templateBase, ...vaccineTemplates];
}

export function createDefaultTaskTemplates(cows, settings) {
  return [...buildBaseTaskTemplates(cows, settings), ...buildMilkingTemplates(settings)];
}

export function buildMilkingTemplates(settings) {
  const templates = [];
  const frequency = settings.milking_frequency || '2x/day';
  const mode = settings.milking_schedule_mode || 'same_for_all';

  if (mode !== 'same_for_all') {
    return templates;
  }

  templates.push({
    template_id: 'tmpl-milking-am',
    title: 'Milking - Morning session',
    category: 'milking',
    start_date: formatDateOnly(startOfDay(0)),
    recurrence: { every: 1, unit: 'days' },
    default_time: settings.morning_window_start || '06:00',
    assigned_to: null,
    notes: 'Generated from milking schedule settings.',
  });

  if (frequency === '2x/day') {
    templates.push({
      template_id: 'tmpl-milking-pm',
      title: 'Milking - Evening session',
      category: 'milking',
      start_date: formatDateOnly(startOfDay(0)),
      recurrence: { every: 1, unit: 'days' },
      default_time: settings.evening_window_start || '17:00',
      assigned_to: null,
      notes: 'Generated from milking schedule settings.',
    });
  }

  if (frequency === '3x/day') {
    templates.push({
      template_id: 'tmpl-milking-mid',
      title: 'Milking - Midday session',
      category: 'milking',
      start_date: formatDateOnly(startOfDay(0)),
      recurrence: { every: 1, unit: 'days' },
      default_time: settings.midday_window_start || '12:00',
      assigned_to: null,
      notes: 'Generated from milking schedule settings.',
    });
    templates.push({
      template_id: 'tmpl-milking-pm',
      title: 'Milking - Evening session',
      category: 'milking',
      start_date: formatDateOnly(startOfDay(0)),
      recurrence: { every: 1, unit: 'days' },
      default_time: settings.evening_window_start || '17:00',
      assigned_to: null,
      notes: 'Generated from milking schedule settings.',
    });
  }

  return templates;
}

function defaultBaseline(cow) {
  const seed = hashString(cow.ear_tag_id);
  const dairy = cow.production_type === 'dairy';
  return {
    trough_minutes_today: Number(seededBetween(seed + 1, dairy ? 128 : 96, dairy ? 186 : 146).toFixed(1)),
    meals_count_today: Number(seededBetween(seed + 2, dairy ? 7.1 : 5.8, dairy ? 11.6 : 9.1).toFixed(1)),
    avg_meal_minutes_today: Number(seededBetween(seed + 3, 12.1, 20.8).toFixed(1)),
    feed_intake_est_kg_today: seededUnit(seed + 4) > 0.22
      ? Number(seededBetween(seed + 4, dairy ? 16.8 : 10.4, dairy ? 24.4 : 16.2).toFixed(2))
      : null,
    temp_c_today: Number(seededBetween(seed + 5, 23.5, 30.1).toFixed(1)),
    humidity_pct_today: Number(seededBetween(seed + 6, 49.5, 71.5).toFixed(1)),
    alone_minutes_today: Number(seededBetween(seed + 7, 10.2, 41.6).toFixed(1)),
    activity_index_today: seededUnit(seed + 8) > 0.12 ? Number(seededBetween(seed + 8, 0.58, 0.93).toFixed(2)) : null,
    lying_minutes_today: seededUnit(seed + 9) > 0.18 ? Number(seededBetween(seed + 9, 392, 622).toFixed(1)) : null,
    water_visits_today: seededUnit(seed + 10) > 0.14 ? Number(seededBetween(seed + 10, 5.2, 12.5).toFixed(1)) : null,
    water_minutes_today: seededUnit(seed + 11) > 0.15 ? Number(seededBetween(seed + 11, 18.2, 59.3).toFixed(1)) : null,
    milk_liters_today: dairy ? defaultMilkByType(cow) : null,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function generateMealTimestamps(mealsCount, daySeed) {
  const windows = [
    { center: 6.5 * 60, spread: 55 },
    { center: 11.8 * 60, spread: 72 },
    { center: 17.6 * 60, spread: 78 },
  ];

  const totalMeals = Math.max(1, Math.round(mealsCount));
  const times = [];
  for (let i = 0; i < totalMeals; i += 1) {
    const w = windows[i % windows.length];
    const value = w.center + seededBetween(daySeed + i * 19, -w.spread, w.spread);
    times.push(Math.round(clamp(value, 5 * 60, 21 * 60 + 45)));
  }
  return times.sort((a, b) => a - b);
}

function generateWaterTimestamps(waterVisits, mealTimes, daySeed) {
  const visits = Math.max(1, Math.round(waterVisits || mealTimes.length));
  const times = [];
  for (let i = 0; i < visits; i += 1) {
    const base = mealTimes[i % mealTimes.length] || (7 * 60 + i * 40);
    const value = base + seededBetween(daySeed + i * 11, -45, 65);
    times.push(Math.round(clamp(value, 5 * 60, 22 * 60)));
  }
  return times.sort((a, b) => a - b);
}

function generateDailySignal(cow, baseline, daySeed, dateOffset = 0, overrides = {}) {
  const vary = (key, spread = 0.12) => {
    const base = baseline[key];
    if (base == null) return null;
    return Number((base * seededBetween(daySeed + hashString(key), 1 - spread, 1 + spread)).toFixed(2));
  };

  const weatherWarmup = seededBetween(daySeed + 302, -2.3, 3.1);
  const temp = Number(((baseline.temp_c_today || 27) + weatherWarmup).toFixed(1));
  const humidity = Number(((baseline.humidity_pct_today || 62) + seededBetween(daySeed + 305, -7.5, 8.2)).toFixed(1));

  const meals = vary('meals_count_today', 0.12) || 6.5;
  const trough = vary('trough_minutes_today', 0.16) || 120;

  const signal = {
    date: dateISO(dateOffset),
    trough_minutes_today: trough,
    meals_count_today: meals,
    avg_meal_minutes_today: Number((trough / Math.max(meals, 1)).toFixed(2)),
    feed_intake_est_kg_today: baseline.feed_intake_est_kg_today == null ? null : vary('feed_intake_est_kg_today', 0.15),
    temp_c_today: temp,
    humidity_pct_today: humidity,
    alone_minutes_today: vary('alone_minutes_today', 0.24),
    activity_index_today: baseline.activity_index_today == null ? null : Number(clamp(vary('activity_index_today', 0.15), 0.1, 1.1).toFixed(2)),
    lying_minutes_today: baseline.lying_minutes_today == null ? null : vary('lying_minutes_today', 0.16),
    water_visits_today: baseline.water_visits_today == null ? null : vary('water_visits_today', 0.2),
    water_minutes_today: baseline.water_minutes_today == null ? null : vary('water_minutes_today', 0.2),
    milk_liters_today: cow.production_type === 'dairy' && baseline.milk_liters_today != null ? vary('milk_liters_today', 0.14) : null,
  };

  const mealTimes = generateMealTimestamps(signal.meals_count_today, daySeed + 410);
  const waterTimes = generateWaterTimestamps(signal.water_visits_today || mealTimes.length, mealTimes, daySeed + 530);

  return sanitizeSignalRecord({
    ...signal,
    meal_timestamps: mealTimes,
    water_timestamps: waterTimes,
    ...overrides,
  }, `generated-${cow.ear_tag_id}`);
}

export function buildCowHistoryBundle(cow, dayIndex = 0, days = HISTORY_DAYS) {
  const baseline = defaultBaseline(cow);
  const series = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const offset = dayIndex - i;
    const seed = hashString(`${cow.ear_tag_id}-day-${offset}`);
    const signal = generateDailySignal(cow, baseline, seed, offset);
    series.push(signal);
  }

  return { baseline, series };
}

function sanitizeFarmSignals(state) {
  const historyByTag = {};
  Object.entries(state.historyByTag || {}).forEach(([tag, series]) => {
    historyByTag[tag] = sanitizeSignalSeries(series, `history-${tag}`);
  });

  const todaySignalsByTag = {};
  Object.entries(state.todaySignalsByTag || {}).forEach(([tag, signal]) => {
    todaySignalsByTag[tag] = sanitizeSignalRecord(signal, `today-${tag}`);
  });

  return {
    ...state,
    historyByTag,
    todaySignalsByTag,
  };
}

function detectionTimeString(seed) {
  const h = Math.floor(seededBetween(seed + 1, 5, 20));
  const m = Math.floor(seededBetween(seed + 2, 0, 59));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildDetectedTags(cows, dayIndex = 0) {
  const active = cows.filter((cow) => cow.is_active);
  const entries = active.map((cow, idx) => {
    const seed = hashString(`${cow.ear_tag_id}-${dayIndex}-${idx}`);
    return {
      id: `det-${dayIndex}-${cow.ear_tag_id}`,
      ear_tag_id: cow.ear_tag_id,
      detected_at: detectionTimeString(seed),
      source: 'camera_ocr',
      matched_cow_id: cow.cow_id,
      matched_name: cow.name || cow.cow_id,
    };
  });

  entries.push({
    id: `det-${dayIndex}-unknown`,
    ear_tag_id: seededChoice(['EA-9000', 'UNKNOWN-44', 'UNREAD-17'], hashString(`unknown-${dayIndex}`)),
    detected_at: '18:42',
    source: 'camera_ocr',
    matched_cow_id: null,
    matched_name: null,
  });

  return entries.sort((a, b) => a.detected_at.localeCompare(b.detected_at));
}

export function computeRollingBaselines(historyByTag, window = 21) {
  const metrics = [
    'trough_minutes_today',
    'meals_count_today',
    'avg_meal_minutes_today',
    'feed_intake_est_kg_today',
    'activity_index_today',
    'alone_minutes_today',
    'water_visits_today',
    'water_minutes_today',
    'lying_minutes_today',
    'temp_c_today',
    'humidity_pct_today',
    'milk_liters_today',
  ];

  const result = {};
  Object.entries(historyByTag || {}).forEach(([tag, series]) => {
    const recent = (series || []).slice(-window);
    const row = {};
    metrics.forEach((metric) => {
      const values = recent.map((item) => item[metric]).filter((value) => value != null && Number.isFinite(value));
      row[metric] = values.length
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
        : null;
    });
    result[tag] = row;
  });
  return result;
}

function defaultSettings() {
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  return {
    is_pro: false,
    demo_mode: false,
    demo_sale_planning_whitelist: [...DEMO_PLANNING_WHITELIST_TAGS],
    farm_id: 'farm-demo',
    farm_name: 'Demo Farm',
    station_id: 'station-main',
    timezone: localTimezone,
    feed_cost_per_kg: 0.32,
    default_feed_intake_mode: 'hybrid',
    kg_per_trough_minute: 0.12,
    kg_per_meal_offset: 0.5,
    milk_price_per_liter: 0.68,
    available_feed_kg_current: 5200,
    vet_visit_cost_estimate: 120,
    milk_loss_cost_per_day_estimate_dairy: 8,
    milk_loss_cost_per_day_estimate_beef: 0,
    days_of_impact_if_escalates: 5,
    labor_value_per_hour: 18,
    daily_feed_budget_cap: null,
    labor_constraint_hours_day: null,
    hoof_trim_interval_weeks: 8,
    water_clean_interval_days: 3,
    feeding_station_label: 'Main feeding station',
    water_point_label: 'Primary trough',
    shade_zone_label: 'North shade zone',
    milking_frequency: '2x/day',
    milking_schedule_mode: 'same_for_all',
    morning_window_start: '05:30',
    morning_window_end: '08:00',
    midday_window_start: '11:30',
    midday_window_end: '13:30',
    evening_window_start: '16:30',
    evening_window_end: '19:00',
    milking_overrides: {},
  };
}

export function buildInitialFarmState(cowCount = DEFAULT_DEMO_COWS) {
  const cows = Array.from({ length: cowCount }, (_, index) => createDemoCow(index));

  const historyByTag = {};
  cows.forEach((cow) => {
    const bundle = buildCowHistoryBundle(cow, 0, HISTORY_DAYS);
    historyByTag[cow.ear_tag_id] = bundle.series;
  });

  const todaySignalsByTag = {};
  Object.entries(historyByTag).forEach(([tag, series]) => {
    todaySignalsByTag[tag] = series[series.length - 1];
  });

  const settings = defaultSettings();
  const taskTemplates = createDefaultTaskTemplates(cows, settings);
  const taskOccurrences = projectTemplateOccurrences(taskTemplates, [], 120, new Date());

  const initial = {
    cows,
    historyByTag,
    todaySignalsByTag,
    baselinesByTag: computeRollingBaselines(historyByTag, 21),
    detectionsToday: buildDetectedTags(cows, 0),
    settings,
    taskTemplates,
    taskOccurrences,
    taskHistory: [],
    day_index: 0,
    demo_click_count: 0,
    last_simulated_at: null,
    baseline_recalibration_until_day: null,
    risk_tracker_by_cow: {},
    service_tickets: [],
  };

  return sanitizeFarmSignals(initial);
}

function applyPct(base, pct) {
  return Number((base * (1 + pct)).toFixed(2));
}

function recalcAvgMeal(signal) {
  const value = Number((signal.trough_minutes_today / Math.max(signal.meals_count_today || 1, 1)).toFixed(2));
  return Math.max(0, Math.min(1440, value));
}

function buildStableDemoSignal(cow, baseline, dayIndex) {
  const seed = hashString(`demo-stable-${cow.ear_tag_id}-${dayIndex}`);
  const baseSignal = generateDailySignal(cow, baseline, seed, dayIndex);
  const stable = {
    ...baseSignal,
    trough_minutes_today: applyPct(baseline.trough_minutes_today, seededBetween(seed + 11, -0.025, 0.025)),
    meals_count_today: applyPct(baseline.meals_count_today, seededBetween(seed + 12, -0.02, 0.02)),
    activity_index_today:
      baseline.activity_index_today == null
        ? null
        : Number(applyPct(baseline.activity_index_today, seededBetween(seed + 13, -0.03, 0.03)).toFixed(2)),
    lying_minutes_today:
      baseline.lying_minutes_today == null
        ? null
        : applyPct(baseline.lying_minutes_today, seededBetween(seed + 14, -0.03, 0.03)),
    water_visits_today:
      baseline.water_visits_today == null
        ? null
        : applyPct(baseline.water_visits_today, seededBetween(seed + 15, -0.03, 0.03)),
    alone_minutes_today:
      baseline.alone_minutes_today == null
        ? null
        : applyPct(baseline.alone_minutes_today, seededBetween(seed + 16, -0.04, 0.04)),
    temp_c_today: Number((baseline.temp_c_today + seededBetween(seed + 17, -0.5, 0.5)).toFixed(1)),
    humidity_pct_today: Number((baseline.humidity_pct_today + seededBetween(seed + 18, -1.8, 1.8)).toFixed(1)),
  };
  stable.avg_meal_minutes_today = recalcAvgMeal(stable);
  return sanitizeSignalRecord(stable, `demo-stable-${cow.ear_tag_id}-${dayIndex}`);
}

function applyDemoTargetIllness(cow, baseline, dayIndex, severity = 'moderate') {
  const seed = hashString(`demo-target-${cow.ear_tag_id}-${dayIndex}-${severity}`);
  const signal = generateDailySignal(cow, baseline, seed, dayIndex);

  const profile = severity === 'high'
    ? { trough: -0.31, meals: -0.22, activity: -0.29, lying: 0.18, alone: 0.08, water: -0.09 }
    : { trough: -0.23, meals: -0.14, activity: -0.2, lying: 0.12, alone: 0.05, water: -0.05 };

  signal.trough_minutes_today = applyPct(baseline.trough_minutes_today, profile.trough);
  signal.meals_count_today = applyPct(baseline.meals_count_today, profile.meals);
  signal.activity_index_today =
    baseline.activity_index_today == null ? null : Number(applyPct(baseline.activity_index_today, profile.activity).toFixed(2));
  signal.lying_minutes_today =
    baseline.lying_minutes_today == null ? null : applyPct(baseline.lying_minutes_today, profile.lying);
  signal.alone_minutes_today =
    baseline.alone_minutes_today == null ? null : applyPct(baseline.alone_minutes_today, profile.alone);
  signal.water_visits_today =
    baseline.water_visits_today == null ? null : applyPct(baseline.water_visits_today, profile.water);

  // Keep heat contribution low/moderate so illness remains the dominant explanation.
  signal.temp_c_today = Number((Math.min(29.5, baseline.temp_c_today + 1.1)).toFixed(1));
  signal.humidity_pct_today = Number((Math.min(63.5, baseline.humidity_pct_today + 1.6)).toFixed(1));
  signal.avg_meal_minutes_today = recalcAvgMeal(signal);
  return sanitizeSignalRecord(signal, `demo-target-${cow.ear_tag_id}-${dayIndex}-${severity}`);
}

function applyDemoSeedConfiguration(state) {
  const next = JSON.parse(JSON.stringify(state));
  const cows = (next.cows || []).map((cow) => {
    const updated = { ...cow };
    updated.planned_cull_or_sale_date = null;
    if (updated.ear_tag_id === DEMO_TARGET_TAG) {
      updated.planned_cull_or_sale_date = startOfDay(52).toISOString();
      updated.feed_intake_mode = 'estimated';
      updated.manual_feed_kg_per_day = null;
      updated.notes = 'Demo target cow for illness progression.';
      updated.production_type = 'dairy';
      updated.sex = 'female';
      updated.pregnancy_due_days = null;
      updated.pregnancy_due_date = null;
    }
    if (updated.ear_tag_id === DEMO_FINISH_TAG) {
      updated.production_type = 'beef';
      updated.sex = 'male';
      updated.planned_cull_or_sale_date = startOfDay(21).toISOString();
      updated.expected_sale_value = Math.max(1200, Number(updated.expected_sale_value || 1250));
      updated.feed_intake_mode = 'estimated';
      updated.manual_feed_kg_per_day = null;
      updated.notes = 'Demo cull-soon cow for finish recommendation.';
    }
    return updated;
  });

  const todaySignalsByTag = { ...next.todaySignalsByTag };
  cows.forEach((cow) => {
    const baseline = next.baselinesByTag[cow.ear_tag_id] || defaultBaseline(cow);
    todaySignalsByTag[cow.ear_tag_id] = buildStableDemoSignal(cow, baseline, 0);
  });

  const historyByTag = { ...next.historyByTag };
  cows.forEach((cow) => {
    const tag = cow.ear_tag_id;
    const series = [...(historyByTag[tag] || [])];
    if (!series.length) return;
    series[series.length - 1] = { ...series[series.length - 1], ...todaySignalsByTag[tag] };
    historyByTag[tag] = sanitizeSignalSeries(series, `demo-seed-history-${tag}`);
  });

  return {
    ...next,
    cows,
    historyByTag,
    todaySignalsByTag,
    baselinesByTag: computeRollingBaselines(historyByTag, 21),
    detectionsToday: buildDetectedTags(cows, 0),
    demo_click_count: 0,
  };
}

export function buildDemoShowcaseState(cowCount = DEFAULT_DEMO_COWS) {
  const base = buildInitialFarmState(cowCount);
  const showcase = applyDemoSeedConfiguration(base);
  return {
    ...showcase,
    settings: {
      ...showcase.settings,
      demo_mode: true,
      demo_sale_planning_whitelist: [...DEMO_PLANNING_WHITELIST_TAGS],
    },
    day_index: 0,
    last_simulated_at: null,
  };
}

function simulateDemoScriptedDay(previousState) {
  const state = JSON.parse(JSON.stringify(previousState));
  const nextDay = (state.day_index || 0) + 1;
  const nextClickCount = (state.demo_click_count || 0) + 1;
  const activeCows = state.cows.filter((cow) => cow.is_active);
  const todaySignalsByTag = { ...state.todaySignalsByTag };
  const target = state.cows.find((cow) => cow.ear_tag_id === DEMO_TARGET_TAG) || activeCows[0];

  activeCows.forEach((cow) => {
    const baseline = state.baselinesByTag[cow.ear_tag_id] || defaultBaseline(cow);
    todaySignalsByTag[cow.ear_tag_id] = buildStableDemoSignal(cow, baseline, nextDay);
  });

  if (target) {
    const baseline = state.baselinesByTag[target.ear_tag_id] || defaultBaseline(target);
    if (nextClickCount === 2) {
      todaySignalsByTag[target.ear_tag_id] = applyDemoTargetIllness(target, baseline, nextDay, 'moderate');
    } else if (nextClickCount >= 3) {
      todaySignalsByTag[target.ear_tag_id] = applyDemoTargetIllness(target, baseline, nextDay, 'high');
    } else {
      todaySignalsByTag[target.ear_tag_id] = buildStableDemoSignal(target, baseline, nextDay);
    }
  }

  const historyByTag = { ...state.historyByTag };
  activeCows.forEach((cow) => {
    const tag = cow.ear_tag_id;
    const existing = historyByTag[tag] || [];
    historyByTag[tag] = sanitizeSignalSeries(
      [...existing, { ...todaySignalsByTag[tag], date: dateISO(nextDay) }].slice(-HISTORY_DAYS),
      `simulate-demo-history-${tag}`
    );
  });

  return {
    ...state,
    historyByTag,
    todaySignalsByTag,
    baselinesByTag: computeRollingBaselines(historyByTag, 21),
    detectionsToday: buildDetectedTags(state.cows, nextDay),
    day_index: nextDay,
    demo_click_count: nextClickCount,
    last_simulated_at: Date.now(),
  };
}

export function simulateScenarioDay(previousState) {
  if (previousState?.settings?.demo_mode) {
    return simulateDemoScriptedDay(previousState);
  }

  const state = JSON.parse(JSON.stringify(previousState));
  const nextDay = (state.day_index || 0) + 1;

  const activeCows = state.cows.filter((cow) => cow.is_active);
  const todaySignalsByTag = { ...state.todaySignalsByTag };

  activeCows.forEach((cow) => {
    const baseline = state.baselinesByTag[cow.ear_tag_id] || defaultBaseline(cow);
    const seed = hashString(`${cow.ear_tag_id}-sim-${nextDay}`);
    todaySignalsByTag[cow.ear_tag_id] = sanitizeSignalRecord(
      generateDailySignal(cow, baseline, seed, nextDay),
      `simulate-generated-${cow.ear_tag_id}`
    );
  });

  const [cowA, cowB, cowC] = activeCows;

  if (cowA) {
    const tag = cowA.ear_tag_id;
    const baseline = state.baselinesByTag[tag] || todaySignalsByTag[tag];
    todaySignalsByTag[tag].trough_minutes_today = applyPct(baseline.trough_minutes_today, -0.25);
    todaySignalsByTag[tag].meals_count_today = applyPct(baseline.meals_count_today, -0.16);
    if (todaySignalsByTag[tag].activity_index_today != null && baseline.activity_index_today != null) {
      todaySignalsByTag[tag].activity_index_today = Number(applyPct(baseline.activity_index_today, -0.21).toFixed(2));
    }
    if (todaySignalsByTag[tag].lying_minutes_today != null && baseline.lying_minutes_today != null) {
      todaySignalsByTag[tag].lying_minutes_today = applyPct(baseline.lying_minutes_today, 0.13);
    }
    todaySignalsByTag[tag].temp_c_today = Number((baseline.temp_c_today + 4).toFixed(1));
    todaySignalsByTag[tag].humidity_pct_today = Number((Math.max(72, baseline.humidity_pct_today + 8)).toFixed(1));
    todaySignalsByTag[tag].avg_meal_minutes_today = recalcAvgMeal(todaySignalsByTag[tag]);
    todaySignalsByTag[tag] = sanitizeSignalRecord(todaySignalsByTag[tag], `simulate-cow-a-${tag}`);
  }

  if (cowB) {
    const tag = cowB.ear_tag_id;
    const baseline = state.baselinesByTag[tag] || todaySignalsByTag[tag];
    if (todaySignalsByTag[tag].alone_minutes_today != null && baseline.alone_minutes_today != null) {
      todaySignalsByTag[tag].alone_minutes_today = applyPct(baseline.alone_minutes_today, 0.55);
    }
    todaySignalsByTag[tag].trough_minutes_today = applyPct(baseline.trough_minutes_today, -0.19);
    todaySignalsByTag[tag].avg_meal_minutes_today = recalcAvgMeal(todaySignalsByTag[tag]);
    todaySignalsByTag[tag] = sanitizeSignalRecord(todaySignalsByTag[tag], `simulate-cow-b-${tag}`);

    const idx = state.cows.findIndex((cow) => cow.cow_id === cowB.cow_id);
    if (idx >= 0) {
      state.cows[idx].pregnancy_due_days = 9;
      state.cows[idx].pregnancy_due_date = startOfDay(9).toISOString();
    }
  }

  if (cowC) {
    const tag = cowC.ear_tag_id;
    const baseline = state.baselinesByTag[tag] || todaySignalsByTag[tag];
    if (todaySignalsByTag[tag].water_visits_today != null && baseline.water_visits_today != null) {
      todaySignalsByTag[tag].water_visits_today = applyPct(baseline.water_visits_today, -0.35);
    }
    todaySignalsByTag[tag].trough_minutes_today = applyPct(baseline.trough_minutes_today, -0.15);
    todaySignalsByTag[tag].temp_c_today = Number((Math.max(33.8, baseline.temp_c_today + 3.8)).toFixed(1));
    todaySignalsByTag[tag].humidity_pct_today = Number((Math.max(74.3, baseline.humidity_pct_today + 10)).toFixed(1));
    todaySignalsByTag[tag].avg_meal_minutes_today = recalcAvgMeal(todaySignalsByTag[tag]);
    todaySignalsByTag[tag] = sanitizeSignalRecord(todaySignalsByTag[tag], `simulate-cow-c-${tag}`);
  }

  const historyByTag = { ...state.historyByTag };
  activeCows.forEach((cow) => {
    const tag = cow.ear_tag_id;
    const existing = historyByTag[tag] || [];
    historyByTag[tag] = sanitizeSignalSeries(
      [...existing, { ...todaySignalsByTag[tag], date: dateISO(nextDay) }].slice(-HISTORY_DAYS),
      `simulate-history-${tag}`
    );
  });

  return {
    ...state,
    historyByTag,
    todaySignalsByTag,
    baselinesByTag: computeRollingBaselines(historyByTag, 21),
    detectionsToday: buildDetectedTags(state.cows, nextDay),
    day_index: nextDay,
    last_simulated_at: Date.now(),
  };
}

export function loadFarmState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.farmState);
    if (!raw) return buildInitialFarmState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cows)) return buildInitialFarmState();
    return parsed;
  } catch {
    return buildInitialFarmState();
  }
}
