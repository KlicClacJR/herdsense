const MINUTES_PER_DAY = 1440;

const MINUTE_FIELDS = [
  'alone_minutes_today',
  'trough_minutes_today',
  'lying_minutes_today',
  'water_minutes_today',
  'avg_meal_minutes_today',
  'activity_minutes_today',
  'active_minutes_today',
];

const TIMESTAMP_FIELDS = ['meal_timestamps', 'water_timestamps'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeMinuteValue(input, field, contextLabel) {
  const parsed = toNumber(input);
  if (parsed == null) return input == null ? null : input;

  let value = parsed;
  let conversion = null;

  if (value > MINUTES_PER_DAY) {
    if (value > 100000) {
      value /= 60000;
      conversion = 'milliseconds to minutes';
    } else if (value > MINUTES_PER_DAY * 3) {
      value /= 60;
      conversion = 'seconds to minutes';
    }
  }

  if (conversion) {
    console.warn(
      `[SignalSanitizer] ${contextLabel}.${field} looked oversized (${parsed}). Converted from ${conversion}.`
    );
  }

  if (value < 0 || value > MINUTES_PER_DAY) {
    console.error(
      `[SignalSanitizer] ${contextLabel}.${field} out of range (${parsed}). Clamped to 0-${MINUTES_PER_DAY}.`
    );
    value = clamp(value, 0, MINUTES_PER_DAY);
  }

  return Number(value.toFixed(2));
}

function normalizeTimestampArray(arr, field, contextLabel) {
  if (!Array.isArray(arr)) return arr;
  return arr
    .map((value) => {
      const parsed = toNumber(value);
      if (parsed == null) return null;
      if (parsed < 0 || parsed > MINUTES_PER_DAY) {
        console.error(
          `[SignalSanitizer] ${contextLabel}.${field} entry out of range (${parsed}). Clamped to 0-${MINUTES_PER_DAY}.`
        );
      }
      return Math.round(clamp(parsed, 0, MINUTES_PER_DAY));
    })
    .filter((value) => value != null)
    .sort((a, b) => a - b);
}

export function sanitizeSignalRecord(signal, contextLabel = 'signal') {
  const next = { ...(signal || {}) };

  MINUTE_FIELDS.forEach((field) => {
    if (field in next) {
      next[field] = normalizeMinuteValue(next[field], field, contextLabel);
    }
  });

  TIMESTAMP_FIELDS.forEach((field) => {
    if (field in next) {
      next[field] = normalizeTimestampArray(next[field], field, contextLabel);
    }
  });

  if (next.activity_index_today != null) {
    const value = Number(next.activity_index_today);
    if (Number.isFinite(value)) {
      if (value < 0 || value > 2) {
        console.error(
          `[SignalSanitizer] ${contextLabel}.activity_index_today out of range (${value}). Clamped to 0-2.`
        );
      }
      next.activity_index_today = Number(clamp(value, 0, 2).toFixed(2));
    } else {
      next.activity_index_today = null;
    }
  }

  return next;
}

export function sanitizeSignalSeries(series, contextPrefix = 'history') {
  return (series || []).map((signal, idx) =>
    sanitizeSignalRecord(signal, `${contextPrefix}[${idx}]`)
  );
}
