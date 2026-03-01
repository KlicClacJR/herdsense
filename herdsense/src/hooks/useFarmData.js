import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '../data/constants';
import {
  buildCowHistoryBundle,
  buildDemoShowcaseState,
  buildDetectedTags,
  buildInitialFarmState,
  buildMilkingTemplates,
  computeRollingBaselines,
  createDefaultTaskTemplates,
  loadFarmState,
  simulateScenarioDay,
} from '../data/demoData';
import { sanitizeSignalRecord, sanitizeSignalSeries } from '../utils/signalSanitizer';
import {
  addCustomOccurrence,
  markOccurrenceDone,
  markOccurrenceSkipped,
  nowInTimezone,
  projectTemplateOccurrences,
} from '../engines/calendarEngine';

function isMilkingSetting(key) {
  return [
    'milking_frequency',
    'milking_schedule_mode',
    'morning_window_start',
    'morning_window_end',
    'midday_window_start',
    'midday_window_end',
    'evening_window_start',
    'evening_window_end',
  ].includes(key);
}

function isTemplateSetting(key) {
  return ['hoof_trim_interval_weeks', 'water_clean_interval_days'].includes(key);
}

function toNumberOr(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseDateOnly(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function isFutureDateOnly(value, timezone = 'UTC') {
  const date = parseDateOnly(value);
  if (!date) return false;
  const today = nowInTimezone(timezone || 'UTC');
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return compare.getTime() > today.getTime();
}

function computedAgeYears(cow, timezone = 'UTC') {
  const dob = parseDateOnly(cow.date_of_birth);
  if (!dob) return cow.age_years ?? null;
  const today = nowInTimezone(timezone || 'UTC');
  const years = (today.getTime() - dob.getTime()) / (365.25 * 86400000);
  if (!Number.isFinite(years) || years < 0) return cow.age_years ?? null;
  return Number(years.toFixed(1));
}

function normalizeTag(tag = '') {
  return tag.trim().toUpperCase();
}

function earTagExists(cows, tag, excludeCowId = null) {
  const normalized = normalizeTag(tag);
  return (cows || []).some(
    (cow) => cow.cow_id !== excludeCowId && normalizeTag(cow.ear_tag_id) === normalized
  );
}

function mergeMilkingTemplates(templates, settings) {
  const nonMilking = (templates || []).filter((template) => !template.template_id.startsWith('tmpl-milking-'));
  return [...nonMilking, ...buildMilkingTemplates(settings)];
}

function syncProjectedOccurrences(templates, occurrences, horizonDays = 120, timezone = 'UTC') {
  const next = [...(occurrences || [])];
  const generated = projectTemplateOccurrences(templates, next, horizonDays, nowInTimezone(timezone));
  return [...next, ...generated];
}

function hydrateState(rawState) {
  if (!rawState || !Array.isArray(rawState.cows)) return buildInitialFarmState();
  if (!rawState.todaySignalsByTag || !rawState.historyByTag || !rawState.baselinesByTag) return buildInitialFarmState();

  const settings = {
    ...buildInitialFarmState(1).settings,
    ...(rawState.settings || {}),
  };
  if (settings.labor_value_per_hour == null && settings.labor_hour_value != null) {
    settings.labor_value_per_hour = settings.labor_hour_value;
  }

  const templates =
    rawState.taskTemplates && rawState.taskTemplates.length
      ? rawState.taskTemplates
      : createDefaultTaskTemplates(rawState.cows, settings);
  const mergedTemplates = templates && templates.length ? mergeMilkingTemplates(templates, settings) : createDefaultTaskTemplates(rawState.cows, settings);

  const occurrences = syncProjectedOccurrences(
    mergedTemplates,
    rawState.taskOccurrences || [],
    120,
    settings.timezone || 'UTC'
  );

  const hydrated = {
    ...rawState,
    settings,
    taskTemplates: mergedTemplates,
    taskOccurrences: occurrences,
    taskHistory: rawState.taskHistory || [],
    baseline_recalibration_until_day: rawState.baseline_recalibration_until_day ?? null,
    demo_click_count: rawState.demo_click_count ?? 0,
    risk_tracker_by_cow: rawState.risk_tracker_by_cow || {},
    service_tickets: rawState.service_tickets || [],
  };

  const sanitizedHistory = {};
  Object.entries(hydrated.historyByTag || {}).forEach(([tag, series]) => {
    sanitizedHistory[tag] = sanitizeSignalSeries(series, `hydrate-history-${tag}`);
  });
  const sanitizedToday = {};
  Object.entries(hydrated.todaySignalsByTag || {}).forEach(([tag, signal]) => {
    sanitizedToday[tag] = sanitizeSignalRecord(signal, `hydrate-today-${tag}`);
  });

  return {
    ...hydrated,
    historyByTag: sanitizedHistory,
    todaySignalsByTag: sanitizedToday,
    baselinesByTag: computeRollingBaselines(sanitizedHistory, 21),
  };
}

function withBaselines(state) {
  return {
    ...state,
    baselinesByTag: computeRollingBaselines(state.historyByTag, 21),
  };
}

export function useFarmData() {
  const [state, setState] = useState(() => hydrateState(loadFarmState()));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.farmState, JSON.stringify(state));
    } catch {
      // ignore write errors
    }
  }, [state]);

  const activeCows = useMemo(
    () =>
      state.cows
        .filter((cow) => cow.is_active !== false)
        .map((cow) => ({
          ...cow,
          age_years: computedAgeYears(cow, state.settings?.timezone || 'UTC'),
        })),
    [state.cows, state.settings?.timezone]
  );

  const pastCows = useMemo(
    () =>
      state.cows
        .filter((cow) => cow.is_active === false)
        .map((cow) => ({
          ...cow,
          age_years: computedAgeYears(cow, state.settings?.timezone || 'UTC'),
        })),
    [state.cows, state.settings?.timezone]
  );

  const addCow = useCallback((input) => {
    const earTag = normalizeTag(input.ear_tag_id);
    if (!earTag) return { ok: false, error: 'Ear tag is required.' };

    let status = { ok: true };

    setState((prev) => {
      if (earTagExists(prev.cows, earTag)) {
        status = { ok: false, error: `Ear tag ${earTag} already exists.` };
        return prev;
      }
      if (input.date_of_birth && isFutureDateOnly(input.date_of_birth, prev.settings?.timezone || 'UTC')) {
        status = { ok: false, error: 'Date of birth cannot be in the future.' };
        return prev;
      }

      const cowId = input.cow_id || `cow-${Date.now()}`;
      const cow = {
        cow_id: cowId,
        ear_tag_id: earTag,
        name: input.name?.trim() || '',
        production_type: input.production_type || 'dairy',
        sex: input.sex || 'female',
        date_of_birth: input.date_of_birth || null,
        age_years:
          input.date_of_birth
            ? null
            : input.age_years === '' || input.age_years == null
              ? null
              : toNumberOr(input.age_years, null),
        lactation_stage: input.lactation_stage || null,
        pregnancy_due_days:
          input.pregnancy_due_days === '' || input.pregnancy_due_days == null
            ? null
            : Math.max(0, Math.round(toNumberOr(input.pregnancy_due_days, 0))),
        pregnancy_due_date: null,
        vaccination_status: Array.isArray(input.vaccination_status) ? input.vaccination_status : [],
        notes: input.notes || '',
        ear_tag_color: input.ear_tag_color || '',
        weight_kg: input.weight_kg === '' || input.weight_kg == null ? null : toNumberOr(input.weight_kg, null),
        planned_cull_or_sale_date: input.planned_cull_or_sale_date || null,
        target_milking_frequency: input.target_milking_frequency || null,
        target_weight_or_goal: input.target_weight_or_goal || null,
        feed_intake_mode: input.feed_intake_mode || 'inherit',
        manual_feed_kg_per_day:
          input.manual_feed_kg_per_day === '' || input.manual_feed_kg_per_day == null
            ? null
            : toNumberOr(input.manual_feed_kg_per_day, null),
        expected_sale_value:
          input.expected_sale_value === '' || input.expected_sale_value == null
            ? null
            : toNumberOr(input.expected_sale_value, null),
        is_active: true,
      };

      if (cow.pregnancy_due_days != null) {
        const due = new Date();
        due.setDate(due.getDate() + cow.pregnancy_due_days);
        cow.pregnancy_due_date = due.toISOString();
      }

      const bundle = buildCowHistoryBundle(cow, prev.day_index || 0, 30);
      const historyByTag = { ...prev.historyByTag, [cow.ear_tag_id]: bundle.series };
      const todaySignalsByTag = {
        ...prev.todaySignalsByTag,
        [cow.ear_tag_id]: bundle.series[bundle.series.length - 1],
      };

      const vaccineTemplate = {
        template_id: `tmpl-vaccine-${cow.cow_id}`,
        title: `Vaccination booster review (${cow.name || cow.cow_id})`,
        category: 'vaccine',
        start_date: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
        recurrence: { every: 6, unit: 'months' },
        default_time: '11:00',
        assigned_to: cow.cow_id,
        notes: `Vaccines on file: ${cow.vaccination_status.join(', ')}`,
      };

      const taskTemplates = [...prev.taskTemplates, vaccineTemplate];
      const taskOccurrences = syncProjectedOccurrences(
        taskTemplates,
        prev.taskOccurrences,
        120,
        prev.settings.timezone || 'UTC'
      );

      const next = withBaselines({
        ...prev,
        cows: [...prev.cows, cow],
        historyByTag,
        todaySignalsByTag,
        taskTemplates,
        taskOccurrences,
      });
      return next;
    });

    return status;
  }, []);

  const updateCow = useCallback((cowId, updates) => {
    let status = { ok: true };

    setState((prev) => {
      const current = prev.cows.find((cow) => cow.cow_id === cowId);
      if (!current) {
        status = { ok: false, error: 'Cow not found.' };
        return prev;
      }

      const nextTag = updates.ear_tag_id != null ? normalizeTag(updates.ear_tag_id) : current.ear_tag_id;
      const nextDob = updates.date_of_birth != null
        ? (updates.date_of_birth || null)
        : (current.date_of_birth || null);
      if (!nextTag) {
        status = { ok: false, error: 'Ear tag is required.' };
        return prev;
      }
      if (earTagExists(prev.cows, nextTag, cowId)) {
        status = { ok: false, error: `Ear tag ${nextTag} already exists.` };
        return prev;
      }
      if (nextDob && isFutureDateOnly(nextDob, prev.settings?.timezone || 'UTC')) {
        status = { ok: false, error: 'Date of birth cannot be in the future.' };
        return prev;
      }

      const cows = prev.cows.map((cow) => {
        if (cow.cow_id !== cowId) return cow;
        const merged = {
          ...cow,
          ...updates,
          ear_tag_id: nextTag,
          date_of_birth: nextDob,
          age_years:
            nextDob
              ? null
              : updates.age_years === ''
              ? null
              : updates.age_years != null
                ? toNullableNumber(updates.age_years, cow.age_years)
                : cow.age_years,
          weight_kg:
            updates.weight_kg === ''
              ? null
              : updates.weight_kg != null
                ? toNullableNumber(updates.weight_kg, cow.weight_kg)
                : cow.weight_kg,
          pregnancy_due_days:
            updates.pregnancy_due_days === ''
              ? null
              : updates.pregnancy_due_days != null
                ? toNullableNumber(updates.pregnancy_due_days, cow.pregnancy_due_days)
                : cow.pregnancy_due_days,
          target_milking_frequency:
            updates.target_milking_frequency === ''
              ? null
              : updates.target_milking_frequency ?? cow.target_milking_frequency ?? null,
          target_weight_or_goal:
            updates.target_weight_or_goal === ''
              ? null
              : updates.target_weight_or_goal ?? cow.target_weight_or_goal ?? null,
          feed_intake_mode:
            updates.feed_intake_mode === ''
              ? 'inherit'
              : updates.feed_intake_mode ?? cow.feed_intake_mode ?? 'inherit',
          manual_feed_kg_per_day:
            updates.manual_feed_kg_per_day === ''
              ? null
              : updates.manual_feed_kg_per_day != null
                ? toNullableNumber(updates.manual_feed_kg_per_day, cow.manual_feed_kg_per_day)
                : cow.manual_feed_kg_per_day ?? null,
          expected_sale_value:
            updates.expected_sale_value === ''
              ? null
              : updates.expected_sale_value != null
                ? toNullableNumber(updates.expected_sale_value, cow.expected_sale_value)
                : cow.expected_sale_value ?? null,
        };

        if (merged.pregnancy_due_days != null) {
          const due = new Date();
          due.setDate(due.getDate() + Number(merged.pregnancy_due_days));
          merged.pregnancy_due_date = due.toISOString();
        } else {
          merged.pregnancy_due_date = null;
        }

        return merged;
      });

      let historyByTag = prev.historyByTag;
      let todaySignalsByTag = prev.todaySignalsByTag;
      let baselinesByTag = prev.baselinesByTag;

      if (nextTag !== current.ear_tag_id) {
        historyByTag = { ...prev.historyByTag, [nextTag]: prev.historyByTag[current.ear_tag_id] || [] };
        todaySignalsByTag = {
          ...prev.todaySignalsByTag,
          [nextTag]: prev.todaySignalsByTag[current.ear_tag_id] || null,
        };
        baselinesByTag = { ...prev.baselinesByTag, [nextTag]: prev.baselinesByTag[current.ear_tag_id] || null };
        delete historyByTag[current.ear_tag_id];
        delete todaySignalsByTag[current.ear_tag_id];
        delete baselinesByTag[current.ear_tag_id];
      }

      return {
        ...prev,
        cows,
        historyByTag,
        todaySignalsByTag,
        baselinesByTag,
      };
    });

    return status;
  }, []);

  const deleteCow = useCallback((cowId) => {
    setState((prev) => {
      const cow = prev.cows.find((item) => item.cow_id === cowId);
      if (!cow) return prev;

      const cows = prev.cows.filter((item) => item.cow_id !== cowId);
      const historyByTag = { ...prev.historyByTag };
      const todaySignalsByTag = { ...prev.todaySignalsByTag };
      const baselinesByTag = { ...prev.baselinesByTag };
      delete historyByTag[cow.ear_tag_id];
      delete todaySignalsByTag[cow.ear_tag_id];
      delete baselinesByTag[cow.ear_tag_id];

      const taskTemplates = prev.taskTemplates.filter((template) => template.assigned_to !== cowId);
      const taskOccurrences = prev.taskOccurrences.filter((occ) => occ.assigned_to !== cowId);

      return {
        ...prev,
        cows,
        historyByTag,
        todaySignalsByTag,
        baselinesByTag,
        taskTemplates,
        taskOccurrences,
      };
    });
  }, []);

  const archiveCow = useCallback((cowId) => {
    setState((prev) => ({
      ...prev,
      cows: prev.cows.map((cow) => (cow.cow_id === cowId ? { ...cow, is_active: false } : cow)),
    }));
  }, []);

  const restoreCow = useCallback((cowId) => {
    setState((prev) => ({
      ...prev,
      cows: prev.cows.map((cow) => (cow.cow_id === cowId ? { ...cow, is_active: true } : cow)),
    }));
  }, []);

  const simulateDay = useCallback(() => {
    setState((prev) => {
      const next = simulateScenarioDay(prev);
      const nextDay = next.day_index || 0;
      return {
        ...next,
        taskOccurrences: syncProjectedOccurrences(
          next.taskTemplates,
          next.taskOccurrences,
          120,
          next.settings.timezone || 'UTC'
        ),
        baseline_recalibration_until_day:
          prev.baseline_recalibration_until_day != null && nextDay > prev.baseline_recalibration_until_day
            ? null
            : prev.baseline_recalibration_until_day,
      };
    });
  }, []);

  const setDemoMode = useCallback((enabled) => {
    setState((prev) => {
      if (enabled) {
        const count = Math.max(5, Math.min(10, prev.cows?.length || 10));
        const demo = buildDemoShowcaseState(count);
        return {
          ...demo,
          settings: {
            ...demo.settings,
            is_pro: prev.settings?.is_pro ?? demo.settings.is_pro,
            demo_mode: true,
          },
          risk_tracker_by_cow: {},
        };
      }

      return {
        ...prev,
        settings: {
          ...prev.settings,
          demo_mode: false,
        },
      };
    });
  }, []);

  const syncRiskTracker = useCallback((nextRiskTrackerByCow) => {
    if (!nextRiskTrackerByCow) return;
    setState((prev) => {
      const previous = JSON.stringify(prev.risk_tracker_by_cow || {});
      const incoming = JSON.stringify(nextRiskTrackerByCow || {});
      if (previous === incoming) return prev;
      return {
        ...prev,
        risk_tracker_by_cow: nextRiskTrackerByCow,
      };
    });
  }, []);

  const addDetectedTag = useCallback((earTagId, source = 'manual') => {
    if (!earTagId?.trim()) return;

    setState((prev) => {
      const normalized = normalizeTag(earTagId);
      const match = prev.cows.find((cow) => normalizeTag(cow.ear_tag_id) === normalized);
      const now = new Date();

      const entry = {
        id: `det-manual-${Date.now()}`,
        ear_tag_id: normalized,
        detected_at: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        source,
        matched_cow_id: match?.cow_id || null,
        matched_name: match?.name || null,
      };

      return {
        ...prev,
        detectionsToday: [entry, ...prev.detectionsToday].slice(0, 32),
      };
    });
  }, []);

  const setProEnabled = useCallback((enabled) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, is_pro: enabled },
    }));
  }, []);

  const createServiceTicket = useCallback((input) => {
    if (!input?.issue_type) return;
    setState((prev) => {
      const now = new Date().toISOString();
      const ticket = {
        ticket_id: `ticket-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        farm_id: prev.settings.farm_id || 'farm-demo',
        station_id: prev.settings.station_id || prev.settings.feeding_station_label || 'station-1',
        issue_type: input.issue_type,
        description: input.description || '',
        photo_name: input.photo_name || null,
        status: 'Open',
        created_at: now,
        timestamp: now,
        farm_name: prev.settings.farm_name || 'Demo Farm',
        last_sync_time: prev.last_simulated_at ? new Date(prev.last_simulated_at).toISOString() : null,
      };
      return {
        ...prev,
        service_tickets: [ticket, ...(prev.service_tickets || [])],
      };
    });
  }, []);

  const updateServiceTicketStatus = useCallback((ticketId, status) => {
    setState((prev) => ({
      ...prev,
      service_tickets: (prev.service_tickets || []).map((ticket) =>
        ticket.ticket_id === ticketId ? { ...ticket, status } : ticket
      ),
    }));
  }, []);

  const updateSetting = useCallback((key, value) => {
    setState((prev) => {
      const nullableSettings = [
        'milk_price_per_liter',
        'available_feed_kg_current',
        'vet_visit_cost_estimate',
        'milk_loss_cost_per_day_estimate_dairy',
        'milk_loss_cost_per_day_estimate_beef',
        'days_of_impact_if_escalates',
        'labor_value_per_hour',
        'labor_constraint_hours_day',
        'daily_feed_budget_cap',
      ];
      const numericSettings = [
        'feed_cost_per_kg',
        'kg_per_trough_minute',
        'kg_per_meal_offset',
        ...nullableSettings,
      ];

      const normalizedValue = numericSettings.includes(key)
        ? key === 'feed_cost_per_kg'
          ? toNumberOr(value, prev.settings[key])
          : toNullableNumber(value, null)
        : value;

      const nextSettings = {
        ...prev.settings,
        [key]: normalizedValue,
      };

      let taskTemplates = prev.taskTemplates;
      let taskOccurrences = prev.taskOccurrences;
      let baselineRecalibrationUntilDay = prev.baseline_recalibration_until_day;

      if (isTemplateSetting(key)) {
        taskTemplates = createDefaultTaskTemplates(prev.cows, nextSettings);
        const templateIds = new Set(taskTemplates.map((item) => item.template_id));
        taskOccurrences = prev.taskOccurrences.filter(
          (occ) => occ.status !== 'pending' || !occ.template_id || templateIds.has(occ.template_id)
        );
      }

      if (isMilkingSetting(key)) {
        taskTemplates = mergeMilkingTemplates(taskTemplates, nextSettings);
        const templateIds = new Set(taskTemplates.map((item) => item.template_id));
        taskOccurrences = taskOccurrences.filter(
          (occ) => occ.status !== 'pending' || !occ.template_id || templateIds.has(occ.template_id)
        );
      }

      if (isMilkingSetting(key) || isTemplateSetting(key)) {
        taskOccurrences = syncProjectedOccurrences(taskTemplates, taskOccurrences, 120, nextSettings.timezone || 'UTC');
      }

      if (key === 'timezone') {
        taskOccurrences = syncProjectedOccurrences(
          taskTemplates,
          taskOccurrences,
          120,
          nextSettings.timezone || 'UTC'
        );
      }

      if (key === 'feeding_station_label') {
        const before = `${prev.settings.feeding_station_label || ''}`.trim();
        const after = `${nextSettings.feeding_station_label || ''}`.trim();
        if (before && after && before !== after) {
          baselineRecalibrationUntilDay = (prev.day_index || 0) + 14;
        }
      }

      return {
        ...prev,
        settings: nextSettings,
        taskTemplates,
        taskOccurrences,
        baseline_recalibration_until_day: baselineRecalibrationUntilDay,
      };
    });
  }, []);

  const updateMilkLiters = useCallback((cowId, liters) => {
    setState((prev) => {
      const cow = prev.cows.find((item) => item.cow_id === cowId);
      if (!cow) return prev;
      const tag = cow.ear_tag_id;
      const current = prev.todaySignalsByTag[tag] || {};

      const value = liters === '' ? null : toNumberOr(liters, current.milk_liters_today || 0);
      const historyByTag = { ...prev.historyByTag };
      const series = [...(historyByTag[tag] || [])];
      if (series.length) {
        const lastIdx = series.length - 1;
        series[lastIdx] = { ...series[lastIdx], milk_liters_today: value };
        historyByTag[tag] = series;
      }

      return {
        ...prev,
        todaySignalsByTag: {
          ...prev.todaySignalsByTag,
          [tag]: { ...current, milk_liters_today: value },
        },
        historyByTag,
        baselinesByTag: computeRollingBaselines(historyByTag, 21),
      };
    });
  }, []);

  const markTaskDone = useCallback((occurrenceId) => {
    setState((prev) => {
      const now = nowInTimezone(prev.settings.timezone || 'UTC');
      const result = markOccurrenceDone(prev.taskOccurrences, prev.taskHistory, occurrenceId, now);
      return {
        ...prev,
        taskOccurrences: syncProjectedOccurrences(
          prev.taskTemplates,
          result.occurrences,
          120,
          prev.settings.timezone || 'UTC'
        ),
        taskHistory: result.history,
      };
    });
  }, []);

  const markTaskSkipped = useCallback((occurrenceId) => {
    setState((prev) => {
      const now = nowInTimezone(prev.settings.timezone || 'UTC');
      const result = markOccurrenceSkipped(prev.taskOccurrences, prev.taskHistory, occurrenceId, now);
      return {
        ...prev,
        taskOccurrences: result.occurrences,
        taskHistory: result.history,
      };
    });
  }, []);

  const addCustomTask = useCallback((taskInput) => {
    setState((prev) => ({
      ...prev,
      taskOccurrences: addCustomOccurrence(prev.taskOccurrences, taskInput),
    }));
  }, []);

  const addMilkingReminders = useCallback((reminders) => {
    if (!Array.isArray(reminders) || reminders.length === 0) return;

    setState((prev) => {
      let taskOccurrences = [...prev.taskOccurrences];
      const existingKey = new Set(
        taskOccurrences.map(
          (task) => `${task.category}|${task.title}|${task.due_date}|${task.due_time || ''}|${task.assigned_to || 'farm'}`
        )
      );
      reminders.forEach((reminder) => {
        const key = `milking|${reminder.title}|${reminder.due_date}|${reminder.due_time || ''}|${reminder.assigned_to || 'farm'}`;
        if (!existingKey.has(key)) {
          taskOccurrences = addCustomOccurrence(taskOccurrences, reminder);
          existingKey.add(key);
        }
      });

      return {
        ...prev,
        taskOccurrences,
      };
    });
  }, []);

  const generateRecommendedTasks = useCallback((days = 60) => {
    setState((prev) => ({
      ...prev,
      taskOccurrences: syncProjectedOccurrences(
        prev.taskTemplates,
        prev.taskOccurrences,
        Math.max(7, Number(days) || 60),
        prev.settings.timezone || 'UTC'
      ),
    }));
  }, []);

  const updateCowMilkingOverride = useCallback((cowId, frequency) => {
    setState((prev) => {
      const overrides = { ...(prev.settings.milking_overrides || {}) };
      if (!frequency) {
        delete overrides[cowId];
      } else {
        overrides[cowId] = { frequency };
      }

      return {
        ...prev,
        settings: {
          ...prev.settings,
          milking_overrides: overrides,
        },
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    setState((prev) => {
      const count = Math.max(5, Math.min(10, prev.cows?.length || 10));
      if (prev.settings?.demo_mode) {
        const demo = buildDemoShowcaseState(count);
        return {
          ...demo,
          settings: {
            ...demo.settings,
            is_pro: prev.settings?.is_pro ?? demo.settings.is_pro,
            demo_mode: true,
          },
          risk_tracker_by_cow: {},
        };
      }
      return buildInitialFarmState(count);
    });
  }, []);

  const reseedDemo = useCallback((count = 8) => {
    setState(buildInitialFarmState(count));
  }, []);

  const baselineRecalibrationDaysLeft = useMemo(() => {
    if (state.baseline_recalibration_until_day == null) return 0;
    return Math.max(0, state.baseline_recalibration_until_day - (state.day_index || 0));
  }, [state.baseline_recalibration_until_day, state.day_index]);

  return {
    state,
    cows: state.cows,
    activeCows,
    pastCows,
    todaySignalsByTag: state.todaySignalsByTag,
    baselinesByTag: state.baselinesByTag,
    historyByTag: state.historyByTag,
    detectionsToday: state.detectionsToday,
    settings: state.settings,
    taskTemplates: state.taskTemplates,
    taskOccurrences: state.taskOccurrences,
    taskHistory: state.taskHistory,
    riskTrackerByCow: state.risk_tracker_by_cow || {},
    serviceTickets: state.service_tickets || [],
    lastSyncTime: state.last_simulated_at ? new Date(state.last_simulated_at).toISOString() : null,
    baselineRecalibrationDaysLeft,
    dayKey: `day-${state.day_index || 0}`,
    demoClickCount: state.demo_click_count || 0,
    addCow,
    updateCow,
    deleteCow,
    archiveCow,
    restoreCow,
    simulateDay,
    addDetectedTag,
    setDemoMode,
    syncRiskTracker,
    setProEnabled,
    createServiceTicket,
    updateServiceTicketStatus,
    updateSetting,
    updateMilkLiters,
    markTaskDone,
    markTaskSkipped,
    addCustomTask,
    addMilkingReminders,
    generateRecommendedTasks,
    updateCowMilkingOverride,
    resetDemo,
    reseedDemo,
  };
}
