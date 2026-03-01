import assert from 'node:assert/strict';
import { computeCowInsight } from '../src/engines/insights_engine.js';

const cow = {
  cow_id: 'cow-test-1',
  ear_tag_id: 'EA-TEST-1',
  sex: 'female',
  production_type: 'dairy',
  pregnancy_due_days: 45,
  is_active: true,
};

const baseline = {
  trough_minutes_today: 120,
  meals_count_today: 10,
  feed_intake_est_kg_today: 18,
  activity_index_today: 0.8,
  alone_minutes_today: 30,
  water_visits_today: 8,
  lying_minutes_today: 500,
  temp_c_today: 28,
  humidity_pct_today: 62,
};

const signal = {
  trough_minutes_today: 90, // -25%
  meals_count_today: 8.4, // -16%
  feed_intake_est_kg_today: 14.5,
  activity_index_today: 0.632, // -21%
  alone_minutes_today: 34,
  water_visits_today: 6.5,
  lying_minutes_today: 565, // +13%
  temp_c_today: 33.5,
  humidity_pct_today: 74,
};

const insight = computeCowInsight(
  cow,
  signal,
  baseline,
  { congestionScore: 0.42 },
  'sample-day',
  { baselineRecalibrationActive: false }
);

const illness = insight.contributing_scores.illness || 0;
const heat = insight.contributing_scores.heat || 0;
const risk = insight.overall_risk_pct || 0;

assert.ok(illness >= 30, `Expected illness contribution to be plausible, got ${illness}`);
assert.ok(heat >= 30, `Expected heat contribution to be plausible, got ${heat}`);
assert.ok(risk >= 35, `Expected overall risk to be elevated for this sample day, got ${risk}`);

console.log('insights sample test passed');
console.log(
  `Overall risk ${risk.toFixed(1)}%, Illness score ${illness.toFixed(1)}, Heat score ${heat.toFixed(1)}`
);
