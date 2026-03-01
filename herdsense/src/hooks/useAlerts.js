import { useMemo } from 'react';
import { computeHerdInsights } from '../engines/insights_engine';

const MODERATE_THRESHOLD = 25;
const HIGH_THRESHOLD = 50;
const EXTREME_THRESHOLD = 80;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function strongSignalsFromDeltas(deltas = []) {
  const changes = Object.fromEntries((deltas || []).map((row) => [row.key, row.change]));
  let count = 0;
  if ((changes.trough_minutes_today ?? 0) <= -0.25) count += 1;
  if ((changes.activity_index_today ?? 0) <= -0.25) count += 1;
  if ((changes.lying_minutes_today ?? 0) >= 0.15) count += 1;
  if ((changes.meals_count_today ?? 0) <= -0.2) count += 1;
  return count;
}

function deriveDisplayBand(score, streak, strongSignalCount) {
  if (score < MODERATE_THRESHOLD) {
    return { key: 'low', label: 'Low', title: 'Low Risk', subtitle: null };
  }

  if (score >= HIGH_THRESHOLD) {
    if (score >= EXTREME_THRESHOLD && strongSignalCount >= 3) {
      return { key: 'high', label: 'High (Extreme today)', title: 'High (Extreme today)', subtitle: 'Large multi-signal change today' };
    }
    if (streak >= 2 && strongSignalCount >= 2) {
      return {
        key: 'high',
        label: 'High (Persistent)',
        title: 'High (Persistent)',
        subtitle: `Escalated because this persisted ${streak} days. Take action now.`,
      };
    }
    return {
      key: 'moderate',
      label: 'Moderate (Recheck)',
      title: 'Moderate (Recheck)',
      subtitle: 'Day 1 of change - recheck in 6-12 hours',
    };
  }

  return { key: 'moderate', label: 'Moderate', title: 'Moderate Risk', subtitle: null };
}

function computeHardwareIssue(cows, todaySignalsByTag, baselinesByTag, detectionsToday = []) {
  const active = (cows || []).filter((cow) => cow.is_active !== false);
  if (!active.length) return null;

  const matchedDetections = (detectionsToday || []).filter((entry) => entry.matched_cow_id).length;
  if (matchedDetections === 0) {
    return {
      type: 'camera_not_detecting',
      message: 'Hardware may need inspection: no cows were detected at the station.',
    };
  }

  const minuteKeys = ['trough_minutes_today', 'lying_minutes_today', 'alone_minutes_today'];
  for (const cow of active) {
    const signal = todaySignalsByTag?.[cow.ear_tag_id] || {};
    for (const key of minuteKeys) {
      const value = Number(signal[key]);
      if (Number.isFinite(value) && (value < 0 || value > 1440)) {
        return {
          type: 'incorrect_data',
          message: 'Hardware may need inspection: impossible minute values detected.',
        };
      }
    }
  }

  const flatlineRows = active.map((cow) => {
    const signal = todaySignalsByTag?.[cow.ear_tag_id] || {};
    const baseline = baselinesByTag?.[cow.ear_tag_id] || {};
    const keys = ['trough_minutes_today', 'meals_count_today', 'activity_index_today', 'lying_minutes_today'];
    const comparable = keys.filter((key) => signal[key] != null && baseline[key] != null && baseline[key] !== 0);
    if (!comparable.length) return false;
    const unchanged = comparable.filter((key) => Math.abs((signal[key] - baseline[key]) / baseline[key]) < 0.01).length;
    return unchanged === comparable.length && comparable.length >= 3;
  });
  const flatlineShare = flatlineRows.filter(Boolean).length / active.length;
  if (flatlineShare >= 0.75) {
    return {
      type: 'sensor_flatline',
      message: 'Hardware may need inspection: signals appear flat and unchanged across most cows.',
    };
  }

  return null;
}

export function useAlerts(
  cows,
  todaySignalsByTag,
  baselinesByTag,
  dayKey,
  options = {},
  riskTrackerByCow = {},
  detectionsToday = []
) {
  return useMemo(() => {
    const cowById = new Map((cows || []).map((cow) => [cow.cow_id, cow]));
    const rawInsights = computeHerdInsights(
      cows || [],
      todaySignalsByTag || {},
      baselinesByTag || {},
      dayKey || 'day-0',
      options
    );

    const nextRiskTrackerByCow = { ...(riskTrackerByCow || {}) };
    const insights = rawInsights.map((insight) => {
      const previous = nextRiskTrackerByCow[insight.cow_id] || {};
      const cow = cowById.get(insight.cow_id);
      const demoTargetTag = options?.demoTargetEarTag || 'EA-1001';
      const demoMode = Boolean(options?.demoMode);
      const demoClickCount = Number(options?.demoClickCount || 0);
      const isDemoWarmup = demoMode && demoClickCount <= 1;
      const isDemoNonTarget = demoMode && cow?.ear_tag_id !== demoTargetTag;
      const isDemoTarget = demoMode && cow?.ear_tag_id === demoTargetTag;
      const forceLowDemo = isDemoWarmup || isDemoNonTarget;
      const normalizedInsight = forceLowDemo
        ? {
          ...insight,
          overall_risk_pct: Math.min(Number(insight.overall_risk_pct || 8), 12),
          overall_risk_level: 'LOW',
          top_contributor_key: 'normal',
          top_contributor_label: 'Normal variation',
          top_contributor_level: 'Low',
          top_non_normal_bucket: 'Normal/Low risk',
          top_non_normal_probability: 0.01,
          contributing_factors: (insight.contributing_factors || []).map((factor) => ({
            ...factor,
            score: Math.min(Number(factor.score || 10), 18),
            level: 'Low',
          })),
          contributing_scores: { heat: 12, illness: 12, social: 12, water: 12 },
          why_bullets: ['No major change from usual today.'],
          action_checklist: [
            'No urgent action needed today; continue normal checks.',
            'Recheck tomorrow to confirm trend stays stable.',
          ],
          deltas: [],
          strong_signal_count: 0,
        }
        : isDemoTarget && demoClickCount === 2
          ? {
            ...insight,
            overall_risk_pct: clamp(Number(insight.overall_risk_pct || 45), 42, 58),
            overall_risk_level: 'MODERATE',
            top_contributor_key: 'illness',
            top_contributor_label: 'Illness-related',
          }
          : isDemoTarget && demoClickCount >= 3
            ? {
              ...insight,
              // Keep demo day-3 in persistent-high range (not extreme-today).
              overall_risk_pct: clamp(Number(insight.overall_risk_pct || 72), 65, 78),
              overall_risk_level: 'HIGH',
              top_contributor_key: 'illness',
              top_contributor_label: 'Illness-related',
              strong_signal_count: Math.max(3, Number(insight.strong_signal_count || 0)),
            }
            : insight;
      const strongSignalCount = Math.max(
        strongSignalsFromDeltas(normalizedInsight.deltas),
        normalizedInsight.strong_signal_count || 0
      );
      const score = Number(normalizedInsight.overall_risk_pct || 0);
      const sameDay = previous.last_day_key === dayKey;
      const aboveModerate = score >= MODERATE_THRESHOLD;

      let streak = Number(previous.abnormal_streak_days || 0);
      let yesterdayScore = previous.last_risk_score ?? null;
      let yesterdayBand = previous.last_risk_band ?? null;

      if (!sameDay) {
        yesterdayScore = previous.current_risk_score ?? previous.last_risk_score ?? null;
        yesterdayBand = previous.current_risk_band ?? previous.last_risk_band ?? null;
        streak = aboveModerate ? Number(previous.abnormal_streak_days || 0) + 1 : 0;
      }

      const band = deriveDisplayBand(score, streak, strongSignalCount);
      const resetToNormal = !aboveModerate && Number(previous.abnormal_streak_days || 0) > 0;
      const illnessRecheck =
        band.label === 'Moderate (Recheck)' && normalizedInsight.top_contributor_key === 'illness'
          ? 'Day 1 of change - recheck in 6-12 hours. Possible early illness/injury.'
          : null;
      const subtitle = resetToNormal ? 'Back to normal' : (illnessRecheck || band.subtitle);
      const trendLine =
        yesterdayScore != null && yesterdayBand
          ? `Trend: Risk was ${Math.round(yesterdayScore)}% (${yesterdayBand}) yesterday -> ${Math.round(score)}% (${band.label}) today`
          : null;

      nextRiskTrackerByCow[insight.cow_id] = {
        abnormal_streak_days: streak,
        last_risk_score: yesterdayScore,
        last_risk_band: yesterdayBand,
        current_risk_score: score,
        current_risk_band: band.label,
        last_day_key: dayKey || 'day-0',
      };

      let urgencyScore = Number(normalizedInsight.urgency_score || 0);
      if (band.key === 'low') urgencyScore = 0;
      if (band.key === 'high') urgencyScore += 15;
      if (band.label.includes('Recheck')) urgencyScore = Math.max(urgencyScore - 12, 1);
      if (forceLowDemo) urgencyScore = 0;

      return {
        ...normalizedInsight,
        strong_signal_count: strongSignalCount,
        abnormal_streak_days: streak,
        display_risk_band_key: band.key,
        display_risk_band: band.label,
        display_risk_title: band.title,
        display_subtitle: subtitle,
        trend_line: trendLine,
        urgency_score: urgencyScore,
      };
    });

    const hardwareIssue = computeHardwareIssue(
      cows || [],
      todaySignalsByTag || {},
      baselinesByTag || {},
      detectionsToday || []
    );

    return {
      insights,
      urgentCount: insights.filter((item) => item.display_risk_band_key === 'high').length,
      warningCount: insights.filter((item) => item.display_risk_band_key === 'moderate').length,
      nextRiskTrackerByCow,
      hardwareIssue,
    };
  }, [cows, todaySignalsByTag, baselinesByTag, dayKey, options, riskTrackerByCow, detectionsToday]);
}
