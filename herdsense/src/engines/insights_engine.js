import { RISK_BUCKETS, STATUS_COLORS } from '../data/constants.js';
import { hashString, seededBetween } from '../utils/seed.js';

const FACTORS = {
  heat: 'Heat-related',
  illness: 'Illness-related',
  social: 'Social/resource-related',
  water: 'Water-related',
};

const ACTIONS = {
  illness: [
    'Observe walking for limping.',
    'Check appetite next feeding.',
    'Check manure/hydration.',
    'If not improving within 24h, contact vet/experienced handler.',
  ],
  heat: [
    'Move feeding earlier/later and ensure water is full/clean.',
    'Add shade near water if possible.',
    'Watch for fast breathing/open-mouth breathing.',
  ],
  water: [
    'Check trough flow and cleanliness now.',
    'Confirm all cows can access water without crowding.',
    'If needed, add a second water point near shade.',
  ],
  social: [
    'Watch feeding time and check if this cow is being pushed away.',
    'Split feeding into two waves if crowding is high.',
    'Increase feeding space where possible.',
  ],
  normal: [
    'No urgent action needed today; continue normal checks.',
    'Recheck tomorrow to confirm trend stays stable.',
  ],
  preCalving: [
    'If due date is close, prepare calving area and increase monitoring.',
    'Look for repeated isolation + restlessness.',
    'If she seems distressed or pushes without progress, contact help immediately.',
  ],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pctChange(value, baseline) {
  if (value == null || baseline == null || !Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) {
    return null;
  }
  return (value - baseline) / baseline;
}

function levelFromScore(score) {
  if (score >= 60) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

function overallLabel(riskPct) {
  if (riskPct >= 50) return 'HIGH';
  if (riskPct >= 25) return 'MODERATE';
  return 'LOW';
}

function statusFromRisk(riskPct) {
  if (riskPct >= 50) return { status: 'red', color: STATUS_COLORS.red };
  if (riskPct >= 25) return { status: 'yellow', color: STATUS_COLORS.yellow };
  return { status: 'green', color: STATUS_COLORS.green };
}

function daysUntilDue(cow) {
  if (cow.pregnancy_due_days != null) return Number(cow.pregnancy_due_days);
  if (cow.pregnancy_due_date) {
    const now = new Date();
    const due = new Date(cow.pregnancy_due_date);
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  }
  return null;
}

function factorStrengths(cow, signal, baseline, herdContext) {
  const intakeDrop = Math.max(0, -(pctChange(signal.trough_minutes_today, baseline.trough_minutes_today) || 0));
  const mealsDrop = Math.max(0, -(pctChange(signal.meals_count_today, baseline.meals_count_today) || 0));
  const activityDrop = Math.max(0, -(pctChange(signal.activity_index_today, baseline.activity_index_today) || 0));
  const lyingRise = Math.max(0, pctChange(signal.lying_minutes_today, baseline.lying_minutes_today) || 0);
  const waterDrop = Math.max(0, -(pctChange(signal.water_visits_today, baseline.water_visits_today) || 0));
  const aloneRise = Math.max(0, pctChange(signal.alone_minutes_today, baseline.alone_minutes_today) || 0);

  const temp = signal.temp_c_today ?? baseline.temp_c_today;
  const humidity = signal.humidity_pct_today ?? baseline.humidity_pct_today;
  const hotHumid = temp != null && humidity != null && temp >= 30 && humidity >= 65;

  const illnessPattern = intakeDrop >= 0.2 && mealsDrop >= 0.1 && activityDrop >= 0.15 && lyingRise >= 0.1;

  const heatScore = clamp(
    (hotHumid ? 58 : 0) + intakeDrop * 22 + activityDrop * 18 + waterDrop * 20,
    0,
    100
  );
  const illnessScore = clamp(
    (illnessPattern ? 28 : 0) + intakeDrop * 42 + mealsDrop * 26 + activityDrop * 36 + lyingRise * 26,
    0,
    100
  );
  const socialScore = clamp(
    aloneRise * 45 + mealsDrop * 14 + (herdContext.congestionScore || 0) * 35 + intakeDrop * 10,
    0,
    100
  );
  const waterScore = clamp(
    waterDrop * 60 + (hotHumid ? 22 : 0) + intakeDrop * 12,
    0,
    100
  );

  const missingSignals = [
    signal.activity_index_today,
    signal.lying_minutes_today,
    signal.temp_c_today,
    signal.humidity_pct_today,
    signal.water_visits_today,
  ].filter((value) => value == null).length;

  const strongSignals = [
    intakeDrop >= 0.2,
    mealsDrop >= 0.12,
    activityDrop >= 0.18,
    lyingRise >= 0.1,
    waterDrop >= 0.2,
    hotHumid,
  ].filter(Boolean).length;

  const dueDays = daysUntilDue(cow);
  const preCalvingActive = cow.sex === 'female' && dueDays != null && dueDays <= 30;
  const preCalvingBoost = preCalvingActive
    ? dueDays <= 7
      ? 0.16
      : dueDays <= 14
        ? 0.1
        : 0.06
    : 0;

  return {
    intakeDrop,
    mealsDrop,
    activityDrop,
    lyingRise,
    waterDrop,
    aloneRise,
    hotHumid,
    illnessPattern,
    heatScore,
    illnessScore,
    socialScore,
    waterScore,
    missingSignals,
    strongSignals,
    preCalvingActive,
    preCalvingBoost,
    dueDays,
  };
}

function overallRiskScore(values, confidence, daySeed) {
  const weighted =
    values.intakeDrop * 0.34 +
    values.mealsDrop * 0.16 +
    values.activityDrop * 0.24 +
    values.lyingRise * 0.12 +
    values.waterDrop * 0.1 +
    values.aloneRise * 0.06 +
    (values.hotHumid ? 0.11 : 0) +
    values.preCalvingBoost;

  let risk = 4 + weighted * 88;
  if (values.preCalvingActive && (values.aloneRise >= 0.2 || values.activityDrop >= 0.1)) {
    risk += 6;
  }
  risk *= 0.76 + confidence * 0.24;

  if (values.strongSignals === 0 && values.preCalvingBoost === 0) risk = Math.min(risk, 22);
  if (values.strongSignals >= 3) risk = Math.max(risk, 38);
  if (values.strongSignals >= 4) risk = Math.max(risk, 54);
  if (values.strongSignals >= 5) risk = Math.max(risk, 72);
  if (values.strongSignals < 2 && values.preCalvingBoost < 0.1) risk = Math.min(risk, 48);
  if (values.strongSignals < 4) risk = Math.min(risk, 84);

  risk += seededBetween(daySeed, -2.4, 2.4);
  return clamp(Number(risk.toFixed(1)), 3, 92);
}

function confidenceScore(signal, deltas) {
  const tracked = [
    'trough_minutes_today',
    'meals_count_today',
    'activity_index_today',
    'lying_minutes_today',
    'water_visits_today',
    'temp_c_today',
    'humidity_pct_today',
  ];
  const available = tracked.filter((key) => signal[key] != null).length / tracked.length;
  const magnitude = deltas
    .map((row) => Math.abs(row.change))
    .filter((value) => Number.isFinite(value));
  const avgMag = magnitude.length ? magnitude.reduce((a, b) => a + Math.min(1, b), 0) / magnitude.length : 0;
  return clamp(available * 0.72 + avgMag * 0.28, 0.1, 0.98);
}

function whyBullets(values, dueDays) {
  const bullets = [];
  if (values.intakeDrop > 0.05) bullets.push(`Eating time -${Math.round(values.intakeDrop * 100)}% vs baseline`);
  if (values.mealsDrop > 0.05) bullets.push(`Meals -${Math.round(values.mealsDrop * 100)}% vs baseline`);
  if (values.activityDrop > 0.05) bullets.push(`Activity -${Math.round(values.activityDrop * 100)}% vs baseline`);
  if (values.lyingRise > 0.05) bullets.push(`Lying time +${Math.round(values.lyingRise * 100)}% vs baseline`);
  if (values.waterDrop > 0.05) bullets.push(`Water visits -${Math.round(values.waterDrop * 100)}% vs baseline`);
  if (values.hotHumid) bullets.push('Hot and humid conditions today');
  if (dueDays != null && dueDays <= 30) bullets.push(`Late pregnancy window: due in about ${Math.max(0, dueDays)} day(s)`);
  return bullets.slice(0, 4);
}

function metricDeltaRows(signal, baseline) {
  const metrics = [
    ['trough_minutes_today', 'Eating time'],
    ['meals_count_today', 'Meals count'],
    ['activity_index_today', 'Activity'],
    ['lying_minutes_today', 'Lying time'],
    ['water_visits_today', 'Water visits'],
    ['alone_minutes_today', 'Alone time'],
  ];
  return metrics
    .map(([key, label]) => ({
      key,
      label,
      current: signal[key],
      baseline: baseline[key],
      change: pctChange(signal[key], baseline[key]),
    }))
    .filter((row) => row.change != null);
}

function topContributor(contributions) {
  return [...contributions].sort((a, b) => b.score - a.score)[0];
}

export function computeCowInsight(cow, signal, baseline, herdContext, dayKey, options = {}) {
  const deltas = metricDeltaRows(signal, baseline);
  let confidence = confidenceScore(signal, deltas);
  if (options.baselineRecalibrationActive) confidence = clamp(confidence * 0.8, 0.08, 0.95);

  const values = factorStrengths(cow, signal, baseline, herdContext);
  const seed = hashString(`${cow.ear_tag_id}-${dayKey}`);
  const overallRiskPct = overallRiskScore(values, confidence, seed + 18);
  const overallRiskLevel = overallLabel(overallRiskPct);

  const contributions = [
    { key: 'heat', label: FACTORS.heat, score: Number(values.heatScore.toFixed(1)) },
    { key: 'illness', label: FACTORS.illness, score: Number(values.illnessScore.toFixed(1)) },
    { key: 'social', label: FACTORS.social, score: Number(values.socialScore.toFixed(1)) },
    { key: 'water', label: FACTORS.water, score: Number(values.waterScore.toFixed(1)) },
  ].map((row) => ({
    ...row,
    level: levelFromScore(row.score),
  }));

  const top = topContributor(contributions);
  const topWeightMap = { illness: 1.0, heat: 0.8, water: 0.85, social: 0.6 };
  const preCalvingIsPriority = values.preCalvingActive && values.dueDays != null && values.dueDays <= 30 && overallRiskPct >= 25;
  const severityWeight = preCalvingIsPriority ? 0.95 : (topWeightMap[top.key] || 0.7);
  const urgencyScore = Number((overallRiskPct * confidence * severityWeight).toFixed(2));

  let actions = ACTIONS[top.key] || ACTIONS.normal;
  if (overallRiskPct < 15) actions = ACTIONS.normal;
  if (values.preCalvingActive && values.dueDays != null && values.dueDays <= 30) {
    actions = [...ACTIONS.preCalving, ...actions].slice(0, 4);
  }

  const topRiskLabel = overallRiskPct < 15
    ? 'Normal/Low risk'
    : preCalvingIsPriority
      ? 'Pre-calving risk'
      : top.label;

  return {
    cow_id: cow.cow_id,
    ear_tag_id: cow.ear_tag_id,
    confidence,
    status: statusFromRisk(overallRiskPct),
    urgency_score: urgencyScore,
    overall_risk_pct: overallRiskPct,
    overall_risk_level: overallRiskLevel,
    top_contributor_key: top.key,
    top_contributor_label: top.label,
    top_contributor_level: top.level,
    top_non_normal_bucket: topRiskLabel,
    top_non_normal_probability: overallRiskPct / 100,
    contributing_factors: contributions,
    contributing_scores: Object.fromEntries(contributions.map((item) => [item.key, item.score])),
    why_bullets: whyBullets(values, values.dueDays),
    possible_reasons_line:
      top.key === 'illness' && overallRiskPct >= 25
        ? 'Possible reasons: lameness/injury, early illness, heat-related fatigue'
        : preCalvingIsPriority
          ? 'Possible reason: late pregnancy behavior shift'
        : null,
    action_checklist: actions,
    deltas,
    strong_signal_count: values.strongSignals,
  };
}

export function computeHerdInsights(cows, todaySignalsByTag, baselinesByTag, dayKey, options = {}) {
  const active = (cows || []).filter((cow) => cow.is_active !== false);
  const herdContext = {
    congestionScore: active.length
      ? active.reduce((sum, cow) => sum + ((todaySignalsByTag[cow.ear_tag_id]?.meal_timestamps?.length || 0) > 0 ? 1 : 0), 0) / active.length
      : 0,
  };

  const insights = active.map((cow) => {
    const signal = todaySignalsByTag[cow.ear_tag_id] || {};
    const baseline = baselinesByTag[cow.ear_tag_id] || {};
    return computeCowInsight(cow, signal, baseline, herdContext, dayKey, options);
  });

  return insights.sort((a, b) => b.urgency_score - a.urgency_score);
}

export function riskBuckets() {
  return RISK_BUCKETS;
}
