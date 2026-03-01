import { hashString } from '../utils/seed';
import { DEMO_PLANNING_WHITELIST_TAGS } from '../data/constants';
const DEFAULT_KG_PER_TROUGH_MINUTE = 0.12;
const DEFAULT_KG_PER_MEAL_OFFSET = 0.5;
const FEED_BOUNDS = {
  dairy: [5, 35],
  beef: [5, 30],
  default: [5, 35],
};
const RISK_ESCALATION_PROB = {
  low: 0.03,
  moderate: 0.08,
  high: 0.15,
};
const MONEY_LEAK_TEMPLATES = [
  { id: 'feed_spend_rising', title: 'Feed spend rising week-over-week', category: 'feed' },
  { id: 'milk_revenue_falling', title: 'Milk revenue falling week-over-week', category: 'revenue' },
  { id: 'cow_output_declining', title: 'Cow output falling with steady feed', category: 'cow' },
  { id: 'cow_intake_declining', title: 'Cow intake dropping', category: 'cow' },
  { id: 'feeder_congestion', title: 'Feeding congestion at peak times', category: 'operations' },
  { id: 'heat_window_loss', title: 'Heat window reducing intake', category: 'environment' },
  { id: 'water_access_risk', title: 'Water access risk', category: 'water' },
  { id: 'tasks_overdue', title: 'Overdue tasks', category: 'maintenance' },
  { id: 'inventory_low', title: 'Feed inventory running low', category: 'inventory' },
  { id: 'sale_plan_inefficient', title: 'Sale-date feeding may be inefficient', category: 'planning' },
];

function avg(values) {
  const valid = values.filter((value) => value != null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function sum(values) {
  const valid = values.filter((value) => value != null && Number.isFinite(value));
  return valid.reduce((total, value) => total + value, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatCurrencyRange(low, high, period = 'week') {
  return `$${Math.round(low)}-$${Math.round(high)}/${period}`;
}

function actionBullets(action = '') {
  return String(action)
    .split(/\.| and /g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function impactRangeString(low, high, period = 'week') {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const normalizedLow = Math.max(0, Math.min(low, high));
  const normalizedHigh = Math.max(normalizedLow, Math.max(low, high));
  return formatCurrencyRange(normalizedLow, normalizedHigh, period);
}

function normalizeNonZeroRange(low, high, fallbackLow = 2, fallbackHigh = 8) {
  let minValue = Number.isFinite(low) ? low : fallbackLow;
  let maxValue = Number.isFinite(high) ? high : fallbackHigh;
  if (minValue > maxValue) [minValue, maxValue] = [maxValue, minValue];
  if (Math.abs(minValue) < 0.5 && Math.abs(maxValue) < 0.5) {
    minValue = fallbackLow;
    maxValue = fallbackHigh;
  }
  if (Math.abs(maxValue - minValue) < 0.5) {
    const expand = Math.max(1, Math.abs(maxValue) * 0.2);
    minValue -= expand;
    maxValue += expand;
  }
  return [minValue, maxValue];
}

function roundedNonZero(value) {
  const rounded = Math.round(value);
  if (rounded === 0) return value >= 0 ? 1 : -1;
  return rounded;
}

function monthlyRangeString(low, high) {
  const [minValue, maxValue] = normalizeNonZeroRange(low, high);
  const minRounded = roundedNonZero(minValue);
  const maxRounded = roundedNonZero(maxValue);
  const asDollar = (value) => `${value > 0 ? '+' : value < 0 ? '-' : ''}$${Math.abs(value)}`;
  return `${asDollar(minRounded)} to ${asDollar(maxRounded)}/month`;
}

function monthlyRangeStringDemoPositive(low, high) {
  let [minValue, maxValue] = normalizeNonZeroRange(low, high, 1, 4);
  minValue = Math.max(0, minValue);
  maxValue = Math.max(minValue, maxValue);
  const minRounded = roundedNonZero(minValue);
  const maxRounded = roundedNonZero(maxValue);
  return `+$${Math.abs(minRounded)} to +$${Math.abs(maxRounded)} per month`;
}

function riskBandFromInsight(insight = null) {
  const key = String(insight?.display_risk_band_key || '').toLowerCase();
  if (key === 'high' || key === 'moderate' || key === 'low') return key;
  const pct = Number(insight?.overall_risk_pct || 0);
  if (pct >= 50) return 'high';
  if (pct >= 25) return 'moderate';
  return 'low';
}

function maintainAvoidedDownsideMonthly(cow = {}, settings = {}, riskBand = 'low') {
  const probability = RISK_ESCALATION_PROB[riskBand] ?? RISK_ESCALATION_PROB.low;
  const vetCost = Number.isFinite(Number(settings.vet_visit_cost_estimate))
    ? Number(settings.vet_visit_cost_estimate)
    : 120;
  const dailyLoss = cow.production_type === 'dairy'
    ? (
      Number.isFinite(Number(settings.milk_loss_cost_per_day_estimate_dairy))
        ? Number(settings.milk_loss_cost_per_day_estimate_dairy)
        : 8
    )
    : (
      Number.isFinite(Number(settings.milk_loss_cost_per_day_estimate_beef))
        ? Number(settings.milk_loss_cost_per_day_estimate_beef)
        : 0
    );
  const impactDays = Number.isFinite(Number(settings.days_of_impact_if_escalates))
    ? Math.max(1, Number(settings.days_of_impact_if_escalates))
    : 5;
  const expected = probability * (vetCost + dailyLoss * impactDays);
  return normalizeNonZeroRange(expected * 0.5, expected * 1.2, 5, 20);
}

function parseDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysUntil(dateLike, referenceDate = new Date()) {
  if (!dateLike) return null;
  const due = parseDateOnly(dateLike);
  if (!due || Number.isNaN(due.getTime())) return null;
  const now = new Date(referenceDate);
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(value / 60);
  const m = Math.floor(value % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function todayInTimezone(timezone = 'UTC') {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((item) => item.type === type)?.value);
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
  } catch {
    // fallback
  }
  const fallback = new Date();
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

function activeCows(cows) {
  return (cows || []).filter((cow) => cow.is_active !== false);
}

function normalizeFeedMode(value) {
  const mode = String(value || '').toLowerCase();
  if (mode === 'manual' || mode === 'estimated' || mode === 'hybrid') return mode;
  return 'hybrid';
}

function resolvedFeedMode(cow = {}, settings = {}) {
  const cowMode = String(cow.feed_intake_mode || 'inherit').toLowerCase();
  if (cowMode === 'inherit') {
    return normalizeFeedMode(settings.default_feed_intake_mode || 'hybrid');
  }
  return normalizeFeedMode(cowMode);
}

function hasManualFeed(cow = {}) {
  return Number.isFinite(Number(cow.manual_feed_kg_per_day)) && Number(cow.manual_feed_kg_per_day) > 0;
}

function clampFeedKg(cow = {}, kg) {
  const type = cow.production_type === 'beef' ? 'beef' : cow.production_type === 'dairy' ? 'dairy' : 'default';
  const [minKg, maxKg] = FEED_BOUNDS[type] || FEED_BOUNDS.default;
  return Number(clamp(kg, minKg, maxKg).toFixed(2));
}

function estimateFeedFromSignal(signal = {}, cow = {}, settings = {}) {
  if (signal.feed_intake_est_kg_today != null && Number.isFinite(Number(signal.feed_intake_est_kg_today))) {
    return {
      kg: clampFeedKg(cow, Number(signal.feed_intake_est_kg_today)),
      source: 'estimated',
      method: 'sensor_estimate',
    };
  }

  const kgPerMinute = Number.isFinite(Number(settings.kg_per_trough_minute))
    ? Number(settings.kg_per_trough_minute)
    : DEFAULT_KG_PER_TROUGH_MINUTE;
  const kgPerMeal = Number.isFinite(Number(settings.kg_per_meal_offset))
    ? Number(settings.kg_per_meal_offset)
    : DEFAULT_KG_PER_MEAL_OFFSET;
  const trough = Number(signal.trough_minutes_today || 0);
  const meals = Number(signal.meals_count_today || 0);
  const estimated = trough * kgPerMinute + meals * kgPerMeal;
  return {
    kg: clampFeedKg(cow, estimated),
    source: 'estimated',
    method: 'camera_formula',
  };
}

function resolveFeedForCowSignal(cow = {}, signal = {}, settings = {}) {
  const mode = resolvedFeedMode(cow, settings);
  const manualAvailable = hasManualFeed(cow);
  const manualValue = manualAvailable ? clampFeedKg(cow, Number(cow.manual_feed_kg_per_day)) : null;
  const estimated = estimateFeedFromSignal(signal, cow, settings);

  if (mode === 'manual') {
    return manualAvailable
      ? { kg: manualValue, source: 'manual', mode_applied: 'manual' }
      : { ...estimated, mode_applied: 'manual_fallback_estimated' };
  }

  if (mode === 'estimated') {
    return { ...estimated, mode_applied: 'estimated' };
  }

  if (manualAvailable) {
    return { kg: manualValue, source: 'manual', mode_applied: 'hybrid_manual' };
  }
  return { ...estimated, mode_applied: 'hybrid_estimated' };
}

function historyWithFeed(series = [], cow = {}, settings = {}) {
  return (series || []).map((day) => {
    const feed = resolveFeedForCowSignal(cow, day, settings);
    return {
      ...day,
      feed_effective_kg: feed.kg,
      feed_effective_source: feed.source,
      feed_effective_mode: feed.mode_applied,
    };
  });
}

function sliceLast(series = [], days = 7) {
  return (series || []).slice(Math.max(0, (series || []).length - days));
}

function slicePrev(series = [], days = 7) {
  const end = Math.max(0, (series || []).length - days);
  const start = Math.max(0, end - days);
  return (series || []).slice(start, end);
}

function percentDelta(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function buildFeedRows(cows, todaySignalsByTag, baselinesByTag, settings) {
  return activeCows(cows).map((cow) => {
    const signal = todaySignalsByTag[cow.ear_tag_id] || {};
    const baseline = baselinesByTag[cow.ear_tag_id] || {};
    const feed = resolveFeedForCowSignal(cow, signal, settings);
    const feedCost = feed.kg * (settings.feed_cost_per_kg || 0);
    const milk = signal.milk_liters_today;
    const output = milk == null ? null : Number(milk);
    const efficiency = output != null && feed.kg > 0 ? output / feed.kg : null;
    const baselineRate = Number.isFinite(Number(settings.kg_per_trough_minute))
      ? Number(settings.kg_per_trough_minute)
      : DEFAULT_KG_PER_TROUGH_MINUTE;

    return {
      cow_id: cow.cow_id,
      ear_tag_id: cow.ear_tag_id,
      name: cow.name || cow.cow_id,
      production_type: cow.production_type,
      estimated_feed_kg_day: Number(feed.kg.toFixed(2)),
      feed_source: feed.source,
      estimated_cost_day: Number(feedCost.toFixed(2)),
      output_day_liters: output == null ? null : Number(output.toFixed(2)),
      efficiency: efficiency == null ? null : Number(efficiency.toFixed(3)),
      baseline_feed_kg: baseline.feed_intake_est_kg_today != null
        ? Number(baseline.feed_intake_est_kg_today)
        : Number((baseline.trough_minutes_today || 0) * baselineRate),
      planned_sale_or_cull_date: cow.planned_cull_or_sale_date || null,
      target_weight_or_goal: cow.target_weight_or_goal || null,
    };
  });
}

function buildCowWeeklyMetrics(cow, historyByTag, referenceDate, settings = {}) {
  const series = historyWithFeed(historyByTag[cow.ear_tag_id] || [], cow, settings);
  const last7 = sliceLast(series, 7);
  const prev7 = slicePrev(series, 7);

  const lastFeed = sum(last7.map((day) => day.feed_effective_kg));
  const prevFeed = sum(prev7.map((day) => day.feed_effective_kg));
  const lastFeedAvg = avg(last7.map((day) => day.feed_effective_kg));
  const prevFeedAvg = avg(prev7.map((day) => day.feed_effective_kg));
  const lastMilk = sum(last7.map((day) => (day.milk_liters_today != null ? Number(day.milk_liters_today) : 0)));
  const prevMilk = sum(prev7.map((day) => (day.milk_liters_today != null ? Number(day.milk_liters_today) : 0)));
  const milkEntries = last7.filter((day) => day.milk_liters_today != null).length;
  const lastMilkAvg = milkEntries ? lastMilk / milkEntries : null;
  const prevMilkEntries = prev7.filter((day) => day.milk_liters_today != null).length;
  const prevMilkAvg = prevMilkEntries ? prevMilk / prevMilkEntries : null;
  const eff7 = lastMilk > 0 && lastFeed > 0 ? lastMilk / lastFeed : null;
  const effPrev = prevMilk > 0 && prevFeed > 0 ? prevMilk / prevFeed : null;
  const feedSourceManualDays = last7.filter((day) => day.feed_effective_source === 'manual').length;
  const feedSourceLabel = feedSourceManualDays >= Math.ceil(Math.max(1, last7.length) / 2) ? 'manual' : 'estimated';

  return {
    cow_id: cow.cow_id,
    ear_tag_id: cow.ear_tag_id,
    name: cow.name || cow.cow_id,
    production_type: cow.production_type,
    last7,
    prev7,
    last_feed_kg: Number(lastFeed.toFixed(2)),
    prev_feed_kg: Number(prevFeed.toFixed(2)),
    last_feed_avg_kg: lastFeedAvg == null ? null : Number(lastFeedAvg.toFixed(2)),
    prev_feed_avg_kg: prevFeedAvg == null ? null : Number(prevFeedAvg.toFixed(2)),
    last_milk_liters: Number(lastMilk.toFixed(2)),
    prev_milk_liters: Number(prevMilk.toFixed(2)),
    last_milk_avg_liters: lastMilkAvg == null ? null : Number(lastMilkAvg.toFixed(2)),
    prev_milk_avg_liters: prevMilkAvg == null ? null : Number(prevMilkAvg.toFixed(2)),
    efficiency_7: eff7 == null ? null : Number(eff7.toFixed(3)),
    efficiency_prev_7: effPrev == null ? null : Number(effPrev.toFixed(3)),
    feed_source_label: feedSourceLabel,
    days_to_sale: daysUntil(cow.planned_cull_or_sale_date, referenceDate),
    planned_sale_or_cull_date: cow.planned_cull_or_sale_date || null,
    target_weight_or_goal: cow.target_weight_or_goal || null,
    expected_sale_value: cow.expected_sale_value == null ? null : Number(cow.expected_sale_value),
    manual_feed_kg_per_day: cow.manual_feed_kg_per_day == null ? null : Number(cow.manual_feed_kg_per_day),
    resolved_feed_mode: resolvedFeedMode(cow, settings),
  };
}

function buildCowProfitCards(cows, historyByTag, todaySignalsByTag, settings, insights, referenceDate) {
  const weekly = activeCows(cows).map((cow) => buildCowWeeklyMetrics(cow, historyByTag, referenceDate, settings));
  const herdAvgCost = avg(
    weekly.map((row) => (row.last_feed_avg_kg != null ? row.last_feed_avg_kg * (settings.feed_cost_per_kg || 0) : null))
  ) || 0;

  return weekly.map((row) => {
    const insight = (insights || []).find((item) => item.cow_id === row.cow_id);
    const todaySignal = todaySignalsByTag[row.ear_tag_id] || {};
    const costDay = row.last_feed_avg_kg != null ? row.last_feed_avg_kg * (settings.feed_cost_per_kg || 0) : 0;
    const efficiencyDelta = percentDelta(row.efficiency_7, row.efficiency_prev_7);
    const milkDelta = percentDelta(row.last_milk_avg_liters, row.prev_milk_avg_liters);
    const behaviorRisk = (insight?.overall_risk_pct || 0) / 100;

    let status = 'Stable';
    if (row.efficiency_7 != null && row.efficiency_prev_7 != null) {
      if ((efficiencyDelta || 0) <= -5 || (milkDelta || 0) <= -6) status = 'Declining';
      else if ((efficiencyDelta || 0) >= 5 || (milkDelta || 0) >= 6) status = 'Improving';
    } else if (behaviorRisk >= 0.35 || insight?.status?.status === 'red') {
      status = 'Declining';
    } else if (behaviorRisk <= 0.18) {
      status = 'Stable';
    } else {
      status = 'Watch';
    }

    let recommendation = 'Watch';
    if (status === 'Improving') recommendation = 'Keep';
    else if (status === 'Declining' && costDay >= herdAvgCost * 1.05) recommendation = 'Investigate';
    else if (status === 'Stable' && row.days_to_sale != null && row.days_to_sale >= 0 && row.days_to_sale <= 45) {
      recommendation = 'Consider sale timing';
    } else if (row.last_milk_avg_liters == null && !Number.isFinite(todaySignal.activity_index_today)) {
      recommendation = 'Watch';
    } else if (status === 'Stable') {
      recommendation = 'Keep';
    }

    if (status === 'Declining' && recommendation !== 'Consider sale timing') {
      recommendation = 'Investigate';
    }

    const statusLabel = ['Improving', 'Stable', 'Declining'].includes(status) ? status : 'Stable';
    const note = row.last_milk_avg_liters == null
      ? 'Status based on behavior signals.'
      : 'Status based on 7-day output and feed trend.';

    return {
      cow_id: row.cow_id,
      ear_tag_id: row.ear_tag_id,
      name: row.name,
      estimated_cost_day: Number(costDay.toFixed(2)),
      estimated_output_day: row.last_milk_avg_liters,
      efficiency_7: row.efficiency_7,
      efficiency_prev_7: row.efficiency_prev_7,
      status: statusLabel,
      recommendation,
      note,
      trend_delta_pct: row.efficiency_7 != null ? efficiencyDelta : milkDelta,
      days_to_sale: row.days_to_sale,
      planned_sale_or_cull_date: row.planned_sale_or_cull_date,
      feed_source_label: row.feed_source_label,
      target_weight_or_goal: row.target_weight_or_goal,
    };
  });
}

function levelFromCongestion(score) {
  if (score == null) return 'unknown';
  if (score >= 0.65) return 'high';
  if (score >= 0.35) return 'moderate';
  return 'low';
}

function slotLabel(slotIndex) {
  const start = slotIndex * 30;
  const end = start + 30;
  return `${minutesToTime(start)}-${minutesToTime(end)}`;
}

function buildSlotCounts(cows, todaySignalsByTag, key, durationFn) {
  const counts = new Array(48).fill(0);

  activeCows(cows).forEach((cow) => {
    const signal = todaySignalsByTag[cow.ear_tag_id] || {};
    let times = Array.isArray(signal[key]) ? signal[key] : [];
    if (key === 'water_timestamps' && times.length === 0 && signal.water_visits_today != null) {
      const approx = Math.max(1, Math.round(signal.water_visits_today));
      times = Array.from({ length: approx }, (_, idx) => 6 * 60 + idx * (12 * 60 / approx));
    }
    const durationSlots = Math.max(1, durationFn(signal));

    times.forEach((minute) => {
      const startSlot = Math.floor(minute / 30);
      for (let slot = startSlot; slot < Math.min(48, startSlot + durationSlots); slot += 1) {
        counts[slot] += 1;
      }
    });
  });

  return counts;
}

function analyzeCongestion(cows, todaySignalsByTag, settings = {}) {
  const feedingCounts = buildSlotCounts(cows, todaySignalsByTag, 'meal_timestamps', (signal) => {
    const avgMeal = Number(signal.avg_meal_minutes_today || 15);
    return Math.max(1, Math.round(avgMeal / 30));
  });
  const waterCounts = buildSlotCounts(cows, todaySignalsByTag, 'water_timestamps', () => 1);
  const active = activeCows(cows);

  const feedingSamples = active.reduce(
    (sumCount, cow) => sumCount + ((todaySignalsByTag[cow.ear_tag_id]?.meal_timestamps || []).length || 0),
    0
  );

  if (active.length < 2 || feedingSamples < 6) {
    return {
      has_feeding_data: false,
      congestion_score: null,
      level: 'unknown',
      peak_windows: [],
      interpretation:
        'Not enough data to estimate feeding station congestion. Capture more feeding timestamps for multiple cows.',
      actions: ['Collect more feeding-station observations before making changes.'],
      explanation:
        'Congestion score = fraction of feeding 30-minute bins where 2 or more cows overlap.',
      timezone: settings.timezone || 'local',
      water_congestion_score: null,
      water_level: 'unknown',
      water_interpretation: 'Not enough data to estimate water congestion.',
      how_calculated: [
        'Split the day into 30-minute bins.',
        'Count cows present in each bin.',
        'Congestion = bins with 2+ cows divided by bins with any activity.',
      ],
      avg_cows_simultaneous: null,
    };
  }

  const feedingActiveSlots = feedingCounts.filter((count) => count > 0);
  const overlapSlots = feedingCounts.filter((count) => count >= 2).length;
  const congestionScore = feedingActiveSlots.length ? overlapSlots / feedingActiveSlots.length : 0;
  const avgSimultaneous = feedingActiveSlots.length ? avg(feedingActiveSlots) : 0;

  const peakWindows = feedingCounts
    .map((count, slot) => ({ count, slot }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((item) => `${slotLabel(item.slot)} (${item.count} cows)`);

  const waterActive = waterCounts.filter((count) => count > 0);
  const waterOverlap = waterCounts.filter((count) => count >= 2).length;
  const waterScore = waterActive.length ? waterOverlap / waterActive.length : null;
  const level = levelFromCongestion(congestionScore);
  const waterLevel = levelFromCongestion(waterScore);

  const interpretationByLevel = {
    high: `Congestion is HIGH: cows overlap during ${(congestionScore * 100).toFixed(0)}% of feeding minutes.`,
    moderate: `Congestion is MODERATE: overlap happens during ${(congestionScore * 100).toFixed(0)}% of feeding minutes.`,
    low: `Congestion is LOW: overlap happens during ${(congestionScore * 100).toFixed(0)}% of feeding minutes.`,
    unknown: 'Not enough data to estimate congestion.',
  };

  const actions = [];
  if (level === 'high') {
    actions.push('Add a second feeding spot during peak times.');
    actions.push('Stagger feeding in two waves to reduce crowding.');
    actions.push('Increase trough length or split groups during feeding.');
  } else if (level === 'moderate') {
    actions.push('Monitor under-eaters and consider slight staggering.');
    actions.push('Watch peak windows for displacement behavior.');
  } else {
    actions.push('No immediate change needed; keep weekly monitoring.');
  }

  return {
    has_feeding_data: true,
    congestion_score: Number(congestionScore.toFixed(2)),
    level,
    peak_windows: peakWindows,
    interpretation: `${interpretationByLevel[level]} This can affect intake for lower-ranking cows.`,
    actions,
    explanation: 'Congestion score = fraction of feeding 30-minute bins where 2 or more cows overlap.',
    timezone: settings.timezone || 'local',
    water_congestion_score: waterScore == null ? null : Number(waterScore.toFixed(2)),
    water_level: waterLevel,
    water_interpretation:
      waterScore == null
        ? 'Not enough data to estimate water congestion.'
        : `Water overlap is ${waterLevel.toUpperCase()}: ${(waterScore * 100).toFixed(0)}% of water bins have 2+ cows.`,
    how_calculated: [
      'Split the day into 30-minute bins.',
      'Count cows present in each bin from feeding and water timestamps.',
      'Compute overlap share for feeding and water separately.',
    ],
    avg_cows_simultaneous: Number((avgSimultaneous || 0).toFixed(2)),
  };
}

function buildWeeklyMoneyReport(cows, historyByTag, settings, insights, resourcePlanning, referenceDate, occurrences = []) {
  const active = activeCows(cows);
  const cowWeekly = active.map((cow) => buildCowWeeklyMetrics(cow, historyByTag, referenceDate, settings));

  const feedKgWeek = sum(cowWeekly.map((row) => row.last_feed_kg));
  const feedKgPrevWeek = sum(cowWeekly.map((row) => row.prev_feed_kg));
  const feedSpendWeek = feedKgWeek * (settings.feed_cost_per_kg || 0);
  const feedSpendPrevWeek = feedKgPrevWeek * (settings.feed_cost_per_kg || 0);
  const feedEstimated = cowWeekly.some((row) => row.feed_source_label !== 'manual');

  const milkLitersWeek = sum(cowWeekly.map((row) => row.last_milk_liters));
  const previousMilkLiters = sum(cowWeekly.map((row) => row.prev_milk_liters));
  const hasMilk = cowWeekly.some((row) => row.last_milk_liters > 0);
  const milkRevenueWeek = settings.milk_price_per_liter && hasMilk
    ? milkLitersWeek * settings.milk_price_per_liter
    : null;
  const milkRevenuePrevWeek = settings.milk_price_per_liter
    ? previousMilkLiters * settings.milk_price_per_liter
    : null;

  const milkTrendPct = percentDelta(milkLitersWeek, previousMilkLiters);
  const weeklyProfit = milkRevenueWeek == null ? null : milkRevenueWeek - feedSpendWeek;
  const previousProfit = milkRevenuePrevWeek == null ? null : milkRevenuePrevWeek - feedSpendPrevWeek;
  const profitChangePct = percentDelta(weeklyProfit, previousProfit);
  const changeVsLastWeekPct = profitChangePct != null
    ? profitChangePct
    : percentDelta(feedSpendWeek, feedSpendPrevWeek);
  const changeBasis = profitChangePct != null ? 'profit' : 'feed_spend';
  const milkRevenueChangePct = percentDelta(milkRevenueWeek, milkRevenuePrevWeek);
  const feedSpendDeltaPct = percentDelta(feedSpendWeek, feedSpendPrevWeek);
  const overdueTasks = (occurrences || []).filter((task) => {
    if (task.status !== 'pending') return false;
    const due = parseDateOnly(task.due_date);
    if (!due || Number.isNaN(due.getTime())) return false;
    const compare = new Date(referenceDate);
    compare.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < compare.getTime();
  });
  const daysInventory = (() => {
    if (settings.available_feed_kg_current == null) return null;
    if (feedKgWeek <= 0) return null;
    const burnRate = feedKgWeek / 7;
    return burnRate > 0 ? settings.available_feed_kg_current / burnRate : null;
  })();

  const triggered = [];
  const pushLeak = ({
    templateId,
    suffix = '',
    title,
    why,
    doNext = [],
    evidence,
    severity = 40,
    impactLow = 0,
    impactHigh = 0,
  }) => {
    const meta = MONEY_LEAK_TEMPLATES.find((item) => item.id === templateId);
    const id = `leak-${templateId}${suffix}`;
    if (!meta || triggered.some((item) => item.id === id)) return;
    triggered.push({
      id,
      template_id: templateId,
      category: meta.category,
      title: title || meta.title,
      why,
      action: doNext[0] || '',
      do_next: doNext.slice(0, 2),
      evidence,
      severity: Number(clamp(severity, 1, 99).toFixed(1)),
      impact_low: Number(Math.max(0, impactLow).toFixed(2)),
      impact_high: Number(Math.max(Math.max(0, impactLow), impactHigh).toFixed(2)),
      impact_range: impactRangeString(impactLow, impactHigh, 'week'),
    });
  };

  if (feedSpendDeltaPct != null && feedSpendDeltaPct >= 6) {
    pushLeak({
      templateId: 'feed_spend_rising',
      title: 'Feed spend rising week-over-week',
      why: 'Feed spend is climbing faster than normal this week.',
      doNext: ['Check ration amounts at each feeding.', 'Reduce waste at peak feeding times.'],
      evidence: `Feed spend this week: $${feedSpendWeek.toFixed(0)} (${feedSpendDeltaPct.toFixed(1)}% vs last week).`,
      severity: 54 + Math.min(20, feedSpendDeltaPct),
      impactLow: feedSpendWeek * 0.03,
      impactHigh: feedSpendWeek * 0.08,
    });
  }

  if (milkRevenueWeek != null && milkRevenuePrevWeek != null && milkRevenueChangePct != null && milkRevenueChangePct <= -5) {
    pushLeak({
      templateId: 'milk_revenue_falling',
      title: 'Milk revenue is down this week',
      why: 'Revenue dropped compared with last week.',
      doNext: ['Review lower-output cows first.', 'Check milking schedule consistency.'],
      evidence: `Milk revenue: $${milkRevenueWeek.toFixed(0)} (${milkRevenueChangePct.toFixed(1)}% vs last week).`,
      severity: 56 + Math.min(25, Math.abs(milkRevenueChangePct)),
      impactLow: Math.abs(milkRevenueWeek - milkRevenuePrevWeek) * 0.5,
      impactHigh: Math.abs(milkRevenueWeek - milkRevenuePrevWeek),
    });
  }

  const decliningOutputCow = cowWeekly
    .map((row) => {
      const milkDelta = percentDelta(row.last_milk_avg_liters, row.prev_milk_avg_liters);
      const feedDelta = percentDelta(row.last_feed_avg_kg, row.prev_feed_avg_kg);
      return { ...row, milkDelta, feedDelta };
    })
    .filter((row) => row.milkDelta != null && row.milkDelta <= -8 && (row.feedDelta == null || row.feedDelta >= -2))
    .sort((a, b) => (a.milkDelta || 0) - (b.milkDelta || 0))[0];
  if (decliningOutputCow) {
    const cowSpend = (decliningOutputCow.last_feed_avg_kg || 0) * 7 * (settings.feed_cost_per_kg || 0);
    pushLeak({
      templateId: 'cow_output_declining',
      suffix: `-${decliningOutputCow.cow_id}`,
      title: `${decliningOutputCow.name}: output down while feed stays high`,
      why: 'Output dropped but feed cost did not drop with it.',
      doNext: ['Observe eating consistency for 24-48h.', 'Adjust ration by about 5% and re-check trend.'],
      evidence: `${decliningOutputCow.name} milk trend: ${decliningOutputCow.milkDelta.toFixed(1)}%; feed trend: ${decliningOutputCow.feedDelta == null ? 'N/A' : `${decliningOutputCow.feedDelta.toFixed(1)}%`}.`,
      severity: 60 + Math.min(20, Math.abs(decliningOutputCow.milkDelta)),
      impactLow: cowSpend * 0.06,
      impactHigh: cowSpend * 0.16,
    });
  }

  const reducedIntakeCow = cowWeekly
    .map((row) => ({ ...row, feedDelta: percentDelta(row.last_feed_avg_kg, row.prev_feed_avg_kg) }))
    .filter((row) => row.feedDelta != null && row.feedDelta <= -10)
    .sort((a, b) => (a.feedDelta || 0) - (b.feedDelta || 0))[0];
  if (reducedIntakeCow) {
    const weekCost = (reducedIntakeCow.last_feed_avg_kg || 0) * 7 * (settings.feed_cost_per_kg || 0);
    pushLeak({
      templateId: 'cow_intake_declining',
      suffix: `-${reducedIntakeCow.cow_id}`,
      title: `${reducedIntakeCow.name}: intake trend is down`,
      why: 'Lower intake can reduce output and raise future health costs.',
      doNext: ['Check feeder access and fresh feed availability.', 'Watch the next feeding and confirm recovery.'],
      evidence: `${reducedIntakeCow.name} intake trend: ${reducedIntakeCow.feedDelta.toFixed(1)}% vs prior week.`,
      severity: 52 + Math.min(22, Math.abs(reducedIntakeCow.feedDelta)),
      impactLow: weekCost * 0.04,
      impactHigh: weekCost * 0.12,
    });
  }

  if (resourcePlanning.has_feeding_data && (resourcePlanning.level === 'high' || resourcePlanning.level === 'moderate')) {
    const multi = resourcePlanning.level === 'high' ? [0.015, 0.04] : [0.008, 0.02];
    pushLeak({
      templateId: 'feeder_congestion',
      title: `Feeder congestion: ${resourcePlanning.level.toUpperCase()}`,
      why: 'Crowding can push lower-ranking cows away from feed.',
      doNext: ['Split feeding into two waves.', 'Add feeding space during peak windows.'],
      evidence: `Overlap at feeder: ${((resourcePlanning.congestion_score || 0) * 100).toFixed(0)}%; peak: ${(resourcePlanning.peak_windows || [])[0] || 'N/A'}.`,
      severity: resourcePlanning.level === 'high' ? 74 : 56,
      impactLow: feedSpendWeek * multi[0],
      impactHigh: feedSpendWeek * multi[1],
    });
  }

  const hotRiskCount = (insights || []).filter((item) => (item.contributing_scores?.heat || 0) >= 60).length;
  if (hotRiskCount > 0) {
    pushLeak({
      templateId: 'heat_window_loss',
      title: 'Heat window may be cutting intake',
      why: 'Heat can reduce feeding time and hurt output consistency.',
      doNext: ['Shift feeding to cooler hours.', 'Keep water and shade ready before heat peaks.'],
      evidence: `${hotRiskCount} cow(s) showed higher heat contribution this week.`,
      severity: 50 + Math.min(20, hotRiskCount * 6),
      impactLow: feedSpendWeek * 0.01,
      impactHigh: feedSpendWeek * 0.035,
    });
  }

  const waterRiskCount = (insights || []).filter((item) => (item.contributing_scores?.water || 0) >= 55).length;
  if (waterRiskCount > 0 || resourcePlanning.water_level === 'high') {
    const severityBase = resourcePlanning.water_level === 'high' ? 68 : 52;
    pushLeak({
      templateId: 'water_access_risk',
      title: 'Water access may be limiting intake',
      why: 'Water access issues can quickly lower feeding and output.',
      doNext: ['Check flow and cleanliness at water points.', 'Add a second water point near shade if possible.'],
      evidence: `Water risk flags: ${waterRiskCount} cow(s); water congestion: ${(resourcePlanning.water_level || 'unknown').toUpperCase()}.`,
      severity: severityBase + Math.min(14, waterRiskCount * 4),
      impactLow: feedSpendWeek * 0.01,
      impactHigh: feedSpendWeek * 0.03,
    });
  }

  if (overdueTasks.length > 0) {
    pushLeak({
      templateId: 'tasks_overdue',
      title: `${overdueTasks.length} task(s) overdue`,
      why: 'Late maintenance and care tasks can lead to costly disruptions.',
      doNext: ['Complete overdue hoof/vaccine/maintenance tasks first.', 'Set reminders for the next 2 weeks.'],
      evidence: `Overdue tasks include: ${(overdueTasks.slice(0, 2).map((task) => task.title).join(', ') || 'scheduled tasks')}.`,
      severity: 45 + Math.min(20, overdueTasks.length * 4),
      impactLow: overdueTasks.length * 5,
      impactHigh: overdueTasks.length * 25,
    });
  }

  if (daysInventory != null && daysInventory <= 21) {
    const urgent = daysInventory <= 10;
    pushLeak({
      templateId: 'inventory_low',
      title: `Feed inventory low (${daysInventory.toFixed(1)} days left)`,
      why: 'Low feed stock can force expensive emergency purchases.',
      doNext: ['Plan feed purchase now.', 'Cut avoidable waste this week.'],
      evidence: `Current inventory: ${settings.available_feed_kg_current || 0} kg, burn rate about ${(feedKgWeek / 7).toFixed(1)} kg/day.`,
      severity: urgent ? 80 : 62,
      impactLow: feedSpendWeek * 0.04,
      impactHigh: feedSpendWeek * 0.1,
    });
  }

  const saleLeakCandidate = cowWeekly
    .filter((row) => row.days_to_sale != null && row.days_to_sale >= 0 && row.days_to_sale <= 45)
    .map((row) => ({ ...row, effDelta: percentDelta(row.efficiency_7, row.efficiency_prev_7) }))
    .sort((a, b) => (a.days_to_sale || 999) - (b.days_to_sale || 999))[0];
  if (saleLeakCandidate) {
    const cowSpendWeek = (saleLeakCandidate.last_feed_avg_kg || 0) * 7 * (settings.feed_cost_per_kg || 0);
    const efficiencyLow = saleLeakCandidate.efficiency_7 != null && saleLeakCandidate.efficiency_7 < 1;
    if (efficiencyLow || (saleLeakCandidate.last_feed_avg_kg || 0) > 0) {
      pushLeak({
        templateId: 'sale_plan_inefficient',
        suffix: `-${saleLeakCandidate.cow_id}`,
        title: `${saleLeakCandidate.name}: sale date near, review feeding plan`,
        why: 'A simple feeding adjustment before sale may improve net return.',
        doNext: ['Choose maintain, taper, or max-gain plan in Inventory.', 'Recheck feed spend every 3 days until sale.'],
        evidence: `Sale in ${saleLeakCandidate.days_to_sale} day(s); estimated feed spend $${cowSpendWeek.toFixed(0)}/week.`,
        severity: 58 + (efficiencyLow ? 8 : 0),
        impactLow: cowSpendWeek * 0.05,
        impactHigh: cowSpendWeek * 0.14,
      });
    }
  }

  if (triggered.length === 0) {
    pushLeak({
      templateId: 'tasks_overdue',
      suffix: '-stable-week',
      title: 'No major money leaks found',
      why: 'This week looks stable with current data.',
      doNext: ['Keep feed logs consistent.', 'Keep up recurring maintenance tasks.'],
      evidence: 'No large week-over-week cost or output shifts were detected.',
      severity: 20,
      impactLow: 0,
      impactHigh: 10,
    });
  }

  const leakCards = [...triggered]
    .sort((a, b) => {
      if ((b.severity || 0) !== (a.severity || 0)) return (b.severity || 0) - (a.severity || 0);
      return (b.impact_high || 0) - (a.impact_high || 0);
    })
    .slice(0, 12);

  return {
    feed_spend_week: Number(feedSpendWeek.toFixed(2)),
    feed_spend_prev_week: Number(feedSpendPrevWeek.toFixed(2)),
    feed_spend_change_pct: feedSpendDeltaPct == null ? null : Number(feedSpendDeltaPct.toFixed(1)),
    feed_spend_estimated: feedEstimated,
    milk_revenue_week: milkRevenueWeek == null ? null : Number(milkRevenueWeek.toFixed(2)),
    has_milk_revenue: milkRevenueWeek != null,
    milk_revenue_change_pct: milkRevenueChangePct == null ? null : Number(milkRevenueChangePct.toFixed(1)),
    weekly_profit: weeklyProfit == null ? null : Number(weeklyProfit.toFixed(2)),
    weekly_profit_change_pct: profitChangePct == null ? null : Number(profitChangePct.toFixed(1)),
    change_vs_last_week_pct: changeVsLastWeekPct == null ? null : Number(changeVsLastWeekPct.toFixed(1)),
    change_basis: changeBasis,
    feed_kg_week: Number(feedKgWeek.toFixed(2)),
    milk_liters_week: Number(milkLitersWeek.toFixed(2)),
    milk_trend_pct: milkTrendPct == null ? null : Number(milkTrendPct.toFixed(1)),
    money_leak_templates_available: MONEY_LEAK_TEMPLATES.length,
    money_leaks: leakCards,
  };
}

function buildInventoryPlanning(cows, historyByTag, settings, referenceDate, insights = []) {
  const active = activeCows(cows);
  const allDailyTotals = [];
  const insightByCow = new Map((insights || []).map((item) => [item.cow_id, item]));

  for (let d = 0; d < 7; d += 1) {
    let total = 0;
    active.forEach((cow) => {
      const series = historyWithFeed(historyByTag[cow.ear_tag_id] || [], cow, settings);
      const day = series[series.length - 1 - d];
      if (day) total += Number(day.feed_effective_kg || 0);
    });
    if (total > 0) allDailyTotals.push(total);
  }

  const burnRateKgDay = avg(allDailyTotals) || 0;
  const inventory = settings.available_feed_kg_current;
  const daysRemaining = inventory != null && burnRateKgDay > 0 ? inventory / burnRateKgDay : null;
  const projectedMonthlyFeedCost = burnRateKgDay * (settings.feed_cost_per_kg || 0) * 30;
  const feedCostPerKg = settings.feed_cost_per_kg || 0;
  const budgetCap = settings.daily_feed_budget_cap;
  const budgetPressure = budgetCap != null && burnRateKgDay * feedCostPerKg > budgetCap;
  const weeklyRows = active.map((cow) => buildCowWeeklyMetrics(cow, historyByTag, referenceDate, settings));
  const herdAvgEfficiency = avg(
    weeklyRows
      .filter((row) => row.production_type === 'dairy' && row.efficiency_7 != null)
      .map((row) => row.efficiency_7)
  );
  const herdAvgBeefFeed = avg(
    weeklyRows
      .filter((row) => row.production_type === 'beef' && row.last_feed_avg_kg != null)
      .map((row) => row.last_feed_avg_kg)
  );
  const isDemoMode = Boolean(settings.demo_mode);
  const demoPlanningWhitelistTags =
    isDemoMode && Array.isArray(settings.demo_sale_planning_whitelist) && settings.demo_sale_planning_whitelist.length
      ? settings.demo_sale_planning_whitelist
      : DEMO_PLANNING_WHITELIST_TAGS;
  const demoPlanningWhitelist = new Set(demoPlanningWhitelistTags);

  // Single source-of-truth membership for sale/cull planning.
  const planningCandidates = isDemoMode
    ? active.filter((cow) => demoPlanningWhitelist.has(cow.ear_tag_id))
    : active.filter((cow) => Boolean(cow.planned_cull_or_sale_date));

  let forecasts = planningCandidates
    .map((sourceCow) => {
      const effectiveSaleDate = sourceCow.planned_cull_or_sale_date
        || (
          isDemoMode
            ? (
              sourceCow.ear_tag_id === DEMO_PLANNING_WHITELIST_TAGS[0]
                ? new Date(referenceDate.getTime() + 52 * 86400000).toISOString()
                : sourceCow.ear_tag_id === DEMO_PLANNING_WHITELIST_TAGS[1]
                  ? new Date(referenceDate.getTime() + 21 * 86400000).toISOString()
                  : null
            )
            : null
        );
      if (!effectiveSaleDate) return null;
      const cow = effectiveSaleDate === sourceCow.planned_cull_or_sale_date
        ? sourceCow
        : { ...sourceCow, planned_cull_or_sale_date: effectiveSaleDate };
      const row = buildCowWeeklyMetrics(cow, historyByTag, referenceDate, settings);
      const insight = insightByCow.get(cow.cow_id);
      const daysToSale = row.days_to_sale;
      if (daysToSale == null || daysToSale < 0) return null;

      const currentFeed = Math.max(0.5, row.last_feed_avg_kg || 0.5);
      const milkTrend = percentDelta(row.last_milk_avg_liters, row.prev_milk_avg_liters);
      const feedTrend = percentDelta(row.last_feed_avg_kg, row.prev_feed_avg_kg);
      const milkPrice = settings.milk_price_per_liter;
      const hasMilkData = milkPrice != null && row.last_milk_avg_liters != null;
      const riskBand = riskBandFromInsight(insight);
      const healthRiskElevated = riskBand === 'moderate' || riskBand === 'high';
      const inventoryLow = daysRemaining != null && daysRemaining < 14;
      const lowEfficiencyDairy = row.production_type === 'dairy'
        && row.efficiency_7 != null
        && herdAvgEfficiency != null
        && row.efficiency_7 < herdAvgEfficiency * 0.9;
      const lowEfficiencyBeef = row.production_type === 'beef'
        && herdAvgBeefFeed != null
        && (row.last_feed_avg_kg || 0) > herdAvgBeefFeed * 1.12;
      const lowEfficiency = lowEfficiencyDairy || lowEfficiencyBeef;

      let strategyMode = 'maintain';
      let suggestedChangePct = 0;
      let strategyNote = 'Goal: maximize money saved per month.';

      if (row.production_type === 'dairy') {
        if (healthRiskElevated) {
          strategyMode = 'maintain_health';
          suggestedChangePct = 0;
          strategyNote = 'Health risk is elevated, so stable feeding protects milk consistency.';
        } else if (inventoryLow && lowEfficiencyDairy) {
          strategyMode = 'reduce_inventory';
          suggestedChangePct = -4;
          strategyNote = 'Inventory is tight. Small reduction on low-efficiency cows can save feed cost.';
        } else if ((row.efficiency_7 != null && row.efficiency_prev_7 != null && percentDelta(row.efficiency_7, row.efficiency_prev_7) <= -4)
          || ((milkTrend || 0) <= -6 && (feedTrend || 0) <= -3)) {
          if ((feedTrend || 0) <= -3) {
            strategyMode = 'increase_stabilize';
            suggestedChangePct = 4;
            strategyNote = 'Intake and output are both slipping. A small increase can stabilize production.';
          } else {
            strategyMode = 'reduce_efficiency';
            suggestedChangePct = -4;
            strategyNote = 'Efficiency is declining. A small reduction can improve feed margin.';
          }
        } else {
          strategyMode = 'maintain';
          suggestedChangePct = 0;
          strategyNote = 'Current dairy feeding looks balanced for monthly savings.';
        }
      } else if (healthRiskElevated) {
        strategyMode = 'maintain_check';
        suggestedChangePct = 0;
        strategyNote = 'Health risk is elevated. Stable feeding helps reduce downside risk.';
      } else if (daysToSale <= 30) {
        if (!inventoryLow && !budgetPressure) {
          strategyMode = 'increase_finish';
          suggestedChangePct = 5;
          strategyNote = 'Sale is near. A small finish increase can support net sale return.';
        } else {
          strategyMode = 'maintain';
          suggestedChangePct = 0;
          strategyNote = 'Sale is near but feed pressure is high. Maintain and avoid aggressive changes.';
        }
      } else if (daysToSale > 120) {
        if (lowEfficiencyBeef || inventoryLow || budgetPressure) {
          strategyMode = 'reduce_long_horizon';
          suggestedChangePct = -5;
          strategyNote = 'Long sale horizon with pressure/low efficiency: tapering can save money.';
        } else {
          strategyMode = 'maintain';
          suggestedChangePct = 0;
          strategyNote = 'Long horizon and stable signals: maintain current feeding.';
        }
      } else {
        if (lowEfficiencyBeef && (inventoryLow || budgetPressure)) {
          strategyMode = 'reduce_mid_horizon';
          suggestedChangePct = -4;
          strategyNote = 'Mid-horizon and low efficiency: small taper improves monthly cost control.';
        } else {
          strategyMode = 'maintain';
          suggestedChangePct = 0;
          strategyNote = 'Current beef feeding is acceptable for monthly savings.';
        }
      }

      suggestedChangePct = clamp(suggestedChangePct, -10, 10);
      let planLabel = suggestedChangePct > 0 ? 'Increase' : suggestedChangePct < 0 ? 'Reduce' : 'Maintain';
      let suggestedFeed = Math.max(0.5, Number((currentFeed * (1 + suggestedChangePct / 100)).toFixed(2)));
      const projectedCostCurrent = currentFeed * daysToSale * feedCostPerKg;
      let projectedCostSuggested = suggestedFeed * daysToSale * feedCostPerKg;
      let deltaFeedCostMonth = (suggestedFeed - currentFeed) * feedCostPerKg * 30;
      let baseMonthlySavingsFromFeed = -deltaFeedCostMonth;
      const projectedRevenue = hasMilkData
        ? row.last_milk_avg_liters * daysToSale * milkPrice
        : null;

      let monthlyLow = baseMonthlySavingsFromFeed;
      let monthlyHigh = baseMonthlySavingsFromFeed;
      let impactNote = '';

      const computeMonthlyImpact = () => {
        monthlyLow = baseMonthlySavingsFromFeed;
        monthlyHigh = baseMonthlySavingsFromFeed;
        impactNote = '';

        if (planLabel === 'Maintain') {
          [monthlyLow, monthlyHigh] = maintainAvoidedDownsideMonthly(cow, settings, riskBand);
          impactNote = 'Assumption: avoided escalation risk using conservative vet/output loss costs.';
          return;
        }

        if (row.production_type === 'dairy' && hasMilkData) {
          const monthlyRevenueBase = row.last_milk_avg_liters * milkPrice * 30;
          const responsePct = Math.min(3, Math.abs(suggestedChangePct) * (3 / 5));
          const revenueLow = suggestedChangePct > 0 ? 0 : -(monthlyRevenueBase * responsePct / 100);
          const revenueHigh = suggestedChangePct > 0 ? (monthlyRevenueBase * responsePct / 100) : 0;
          monthlyLow = baseMonthlySavingsFromFeed + revenueLow;
          monthlyHigh = baseMonthlySavingsFromFeed + revenueHigh;
          impactNote = 'Assumption: milk response capped at 0-3% for a ±5% feed change.';
          return;
        }

        if (row.production_type === 'beef' && Number.isFinite(Number(cow.expected_sale_value))) {
          const expectedValue = Number(cow.expected_sale_value);
          const saleScale = Math.max(0.5, Math.min(1.5, Math.abs(suggestedChangePct) / 5));
          const monthlyize = 30 / Math.max(10, Math.min(180, daysToSale));
          const saleLow = suggestedChangePct > 0
            ? expectedValue * 0.003 * saleScale * monthlyize
            : -expectedValue * 0.004 * saleScale * monthlyize;
          const saleHigh = suggestedChangePct > 0
            ? expectedValue * 0.012 * saleScale * monthlyize
            : 0;
          monthlyLow = baseMonthlySavingsFromFeed + saleLow;
          monthlyHigh = baseMonthlySavingsFromFeed + saleHigh;
          impactNote = 'Assumption: includes conservative expected sale value sensitivity.';
          return;
        }

        impactNote = 'Assumption: feed cost change only; sale value change not estimated.';
      };

      computeMonthlyImpact();

      const applySuggestedChange = (nextPct) => {
        suggestedChangePct = clamp(nextPct, -10, 10);
        planLabel = suggestedChangePct > 0 ? 'Increase' : suggestedChangePct < 0 ? 'Reduce' : 'Maintain';
        suggestedFeed = Math.max(0.5, Number((currentFeed * (1 + suggestedChangePct / 100)).toFixed(2)));
        projectedCostSuggested = suggestedFeed * daysToSale * feedCostPerKg;
        deltaFeedCostMonth = (suggestedFeed - currentFeed) * feedCostPerKg * 30;
        baseMonthlySavingsFromFeed = -deltaFeedCostMonth;
        computeMonthlyImpact();
      };

      if (planLabel === 'Increase' && row.production_type === 'beef') {
        if (isDemoMode) {
          const midpoint = (monthlyLow + monthlyHigh) / 2;
          if (midpoint <= 0) {
            applySuggestedChange(0);
            strategyMode = 'maintain_after_guardrail';
            strategyNote = 'Health and margin guardrail: keep feed steady and reassess next week.';
          } else if (Math.min(monthlyLow, monthlyHigh) < 0) {
            applySuggestedChange(3);
            if (Math.min(monthlyLow, monthlyHigh) < 0) {
              applySuggestedChange(0);
              strategyMode = 'maintain_after_guardrail';
              strategyNote = 'Health and margin guardrail: keep feed steady and reassess next week.';
            }
          }
        } else {
          const midpoint = (monthlyLow + monthlyHigh) / 2;
          if (midpoint <= 0) {
            applySuggestedChange(3);
            const adjustedMidpoint = (monthlyLow + monthlyHigh) / 2;
            if (adjustedMidpoint <= 0) {
              applySuggestedChange(0);
              strategyMode = 'maintain_after_guardrail';
              strategyNote = 'Health and margin guardrail: keep feed steady and reassess next week.';
            }
          }
        }
      }

      let suggestion = 'Maintain current feeding';
      if (planLabel === 'Increase') suggestion = 'Increase intake carefully';
      if (planLabel === 'Reduce') suggestion = 'Reduce intake and monitor';
      if (planLabel === 'Maintain' && healthRiskElevated) {
        strategyNote = 'Health risk elevated - keep feed steady; reassess after recovery.';
      }

      let [finalLow, finalHigh] = normalizeNonZeroRange(monthlyLow, monthlyHigh, 3, 12);
      if (isDemoMode) {
        const midpoint = (finalLow + finalHigh) / 2;
        if (midpoint > 0 && finalLow < 0) finalLow = 0;
        if (finalLow < 0) finalLow = 0;
        if (finalHigh < finalLow) finalHigh = finalLow;
      }
      const monthlyImpactLabel = planLabel === 'Increase'
        ? 'Estimated net return change per month'
        : planLabel === 'Reduce'
          ? 'Estimated feed savings per month'
          : 'Estimated avoided loss per month';
      const monthlyImpactRange = isDemoMode
        ? monthlyRangeStringDemoPositive(finalLow, finalHigh)
        : monthlyRangeString(finalLow, finalHigh);
      const monthlyImpactSummary = `${monthlyImpactLabel}: ${monthlyImpactRange}`;

      return {
        cow_id: cow.cow_id,
        name: cow.name || cow.cow_id,
        ear_tag_id: cow.ear_tag_id,
        planned_sale_or_cull_date: cow.planned_cull_or_sale_date,
        days_to_sale: daysToSale,
        current_estimated_feed_kg_day: Number(currentFeed.toFixed(2)),
        current_feed_source: row.feed_source_label,
        suggested_feed_kg_day: Number(suggestedFeed.toFixed(2)),
        suggested_change_pct: suggestedChangePct,
        plan_label: planLabel,
        strategy_mode: strategyMode,
        projected_feed_cost_until_sale: Number(projectedCostSuggested.toFixed(2)),
        projected_feed_cost_current_plan: Number(projectedCostCurrent.toFixed(2)),
        projected_revenue_until_sale: projectedRevenue == null ? null : Number(projectedRevenue.toFixed(2)),
        monthly_money_saved_range: monthlyImpactRange,
        monthly_impact_label: monthlyImpactLabel,
        monthly_impact_summary: monthlyImpactSummary,
        monthly_money_saved_low: Number(Math.min(finalLow, finalHigh).toFixed(2)),
        monthly_money_saved_high: Number(Math.max(finalLow, finalHigh).toFixed(2)),
        note: strategyNote,
        impact_note: impactNote,
        suggestion,
        risk_band: riskBand,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.days_to_sale - b.days_to_sale);

  if (isDemoMode) {
    const expectedTags = new Set(DEMO_PLANNING_WHITELIST_TAGS);
    const actualTags = new Set(forecasts.map((row) => row.ear_tag_id));
    const isExactDemoSet = forecasts.length === expectedTags.size
      && [...expectedTags].every((tag) => actualTags.has(tag));

    if (!isExactDemoSet) {
      console.error(
        '[DemoMode] Sale/cull planning rows mismatch. Expected:',
        [...expectedTags],
        'Got:',
        [...actualTags]
      );
      forecasts = forecasts
        .filter((row) => expectedTags.has(row.ear_tag_id))
        .sort((a, b) => a.days_to_sale - b.days_to_sale);
    }
  }

  return {
    burn_rate_kg_day: Number(burnRateKgDay.toFixed(2)),
    days_of_feed_remaining: daysRemaining == null ? null : Number(daysRemaining.toFixed(1)),
    projected_monthly_feed_cost: Number(projectedMonthlyFeedCost.toFixed(2)),
    daily_feed_budget_cap: settings.daily_feed_budget_cap ?? null,
    forecasts,
    assumptions: [
      'Current feed/day uses manual input when selected, otherwise a 7-day estimated average.',
      'Sale plan impact is a conservative estimate, not a market guarantee.',
    ],
  };
}

function buildDailyHerdSeries(cows, historyByTag, settings = {}) {
  const herd = activeCows(cows);
  const oneTag = herd[0]?.ear_tag_id;
  const length = oneTag ? (historyByTag[oneTag] || []).length : 0;
  const start = Math.max(0, length - 7);
  const dates = [];
  const feed = [];
  const milk = [];
  const efficiency = [];

  for (let i = start; i < length; i += 1) {
    let feedTotal = 0;
    let milkTotal = 0;
    herd.forEach((cow) => {
      const day = historyByTag[cow.ear_tag_id]?.[i] || {};
      const feed = resolveFeedForCowSignal(cow, day, settings);
      feedTotal += feed.kg;
      milkTotal += Number(day.milk_liters_today || 0);
      if (!dates[i - start]) dates[i - start] = String(day.date || '').slice(5, 10);
    });
    feed.push(Number(feedTotal.toFixed(2)));
    milk.push(Number(milkTotal.toFixed(2)));
  }

  for (let i = 0; i < feed.length; i += 1) {
    efficiency.push(feed[i] > 0 ? Number((milk[i] / feed[i]).toFixed(2)) : 0);
  }

  return {
    dates,
    feed,
    milk,
    efficiency,
  };
}

function suggestMilkingSchedule(cows, settings, insights, referenceDate) {
  const dairyCows = activeCows(cows).filter((cow) => cow.production_type === 'dairy');
  const frequency = settings.milking_frequency || '2x/day';
  const mode = settings.milking_schedule_mode || 'same_for_all';
  const overrides = settings.milking_overrides || {};

  const morningStart = parseTimeToMinutes(settings.morning_window_start || '05:30');
  const morningEnd = parseTimeToMinutes(settings.morning_window_end || '08:00');
  const middayStart = parseTimeToMinutes(settings.midday_window_start || '11:30');
  const middayEnd = parseTimeToMinutes(settings.midday_window_end || '13:30');
  const eveningStart = parseTimeToMinutes(settings.evening_window_start || '16:30');
  const eveningEnd = parseTimeToMinutes(settings.evening_window_end || '19:00');

  const heatScore = (avg((insights || []).map((insight) => (insight.contributing_scores?.heat || 0))) || 0) / 100;
  const heatShift = heatScore >= 0.35 ? -60 : 0;

  const morningMid = morningStart != null && morningEnd != null
    ? Math.round((morningStart + morningEnd) / 2) + heatShift
    : 6 * 60 + 30 + heatShift;
  const middayMid = middayStart != null && middayEnd != null
    ? Math.round((middayStart + middayEnd) / 2) + heatShift
    : 12 * 60 + heatShift;
  const eveningMid = eveningStart != null && eveningEnd != null
    ? Math.round((eveningStart + eveningEnd) / 2) + heatShift
    : 17 * 60 + 30 + heatShift;

  const frequencyToTimes = (freq) => {
    if (freq === '1x/day') return [minutesToTime(morningMid)];
    if (freq === '3x/day') return [minutesToTime(morningMid), minutesToTime(middayMid), minutesToTime(eveningMid)];
    return [minutesToTime(morningMid), minutesToTime(eveningMid)];
  };

  const defaultTimes = frequencyToTimes(frequency);
  const reminders = [];
  const todayEvents = [];
  const next7Days = [];
  const prompts = [];
  const notes = [];

  if (heatShift < 0) {
    notes.push('Heat risk is elevated; schedule moved earlier by 1 hour.');
  }
  notes.push('Keep times consistent day-to-day to stabilize output.');

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() + offset);
    const dueDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const events = [];

    if (mode === 'same_for_all') {
      defaultTimes.forEach((time, idx) => {
        const event = {
          title: `Milking reminder ${idx + 1}`,
          category: 'milking',
          due_date: dueDate,
          due_time: time,
          recurrence: null,
          assigned_to: null,
          notes: `Farm-level reminder for ${dairyCows.length} dairy cows.`,
        };
        reminders.push(event);
        events.push({ label: `Farm milking #${idx + 1}`, time });
      });
    } else {
      dairyCows.forEach((cow) => {
        const perCow = overrides[cow.cow_id]?.frequency || cow.target_milking_frequency || frequency;
        const times = frequencyToTimes(perCow);
        times.forEach((time, idx) => {
          const event = {
            title: `Milking ${cow.name || cow.cow_id} #${idx + 1}`,
            category: 'milking',
            due_date: dueDate,
            due_time: time,
            recurrence: null,
            assigned_to: cow.cow_id,
            notes: 'Per-cow override reminder.',
          };
          reminders.push(event);
          events.push({ label: `${cow.name || cow.cow_id} #${idx + 1}`, time });
        });
      });
    }

    if (offset === 0) todayEvents.push(...events);
    next7Days.push({ date: dueDate, events });
  }

  dairyCows.forEach((cow) => {
    const daysToSale = daysUntil(cow.planned_cull_or_sale_date, referenceDate);
    if (cow.lactation_stage === 'early' && (daysToSale == null || daysToSale > 45)) {
      prompts.push(
        `${cow.name || cow.cow_id}: early lactation; consider 3x/day milking if labor allows.`
      );
    }
    if (daysToSale != null && daysToSale >= 0 && daysToSale <= 45) {
      prompts.push(
        `${cow.name || cow.cow_id}: planned sale/cull soon; consider a lower frequency if appropriate to reduce labor.`
      );
    }
  });

  return {
    mode,
    frequency,
    times: defaultTimes,
    notes: notes.slice(0, 4),
    prompts: prompts.slice(0, 6),
    reminders,
    today: todayEvents,
    next7Days,
  };
}

export function computeOptimization(
  cows,
  todaySignalsByTag,
  historyByTag,
  baselinesByTag,
  settings,
  insights,
  occurrences
) {
  const now = todayInTimezone(settings.timezone || 'UTC');
  const feedRows = buildFeedRows(cows, todaySignalsByTag, baselinesByTag, settings);
  const resourcePlanning = analyzeCongestion(cows, todaySignalsByTag, settings);
  const weeklyMoneyReport = buildWeeklyMoneyReport(cows, historyByTag, settings, insights, resourcePlanning, now, occurrences);
  const cowProfitCards = buildCowProfitCards(cows, historyByTag, todaySignalsByTag, settings, insights, now);
  const inventoryPlanning = buildInventoryPlanning(cows, historyByTag, settings, now, insights);
  const milking = suggestMilkingSchedule(cows, settings, insights || [], now);
  const charts = buildDailyHerdSeries(cows, historyByTag, settings);

  const tasksDueSoon = (occurrences || [])
    .filter((task) => task.status === 'pending')
    .filter((task) => {
      const due = parseDateOnly(task.due_date);
      const diffDays = due ? (due.getTime() - now.getTime()) / 86400000 : null;
      return diffDays != null && diffDays >= 0 && diffDays <= 14;
    })
    .sort((a, b) => parseDateOnly(a.due_date).getTime() - parseDateOnly(b.due_date).getTime());

  return {
    feedRows,
    weeklyMoneyReport,
    cowProfitCards,
    milking,
    inventoryPlanning,
    resourcePlanning,
    charts,
    tasksDueSoon,
  };
}

export function nextDueDate(task, fromDate = new Date()) {
  const due = new Date(fromDate);
  const recurrence = task.recurrence || { every: 14, unit: 'days' };
  if (recurrence.unit === 'weeks') {
    due.setDate(due.getDate() + recurrence.every * 7);
  } else if (recurrence.unit === 'months') {
    const baseDay = due.getDate();
    const target = new Date(due.getFullYear(), due.getMonth() + recurrence.every, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(baseDay, lastDay));
    return target.toISOString();
  } else {
    due.setDate(due.getDate() + recurrence.every);
  }
  return due.toISOString();
}

export function defaultMilkForCow(cowId, dayIndex) {
  const seed = hashString(`${cowId}-milk-${dayIndex}`);
  const base = 15.4 + (seed % 130) / 10;
  return Number(base.toFixed(1));
}
