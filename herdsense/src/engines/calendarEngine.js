import { hashString } from '../utils/seed.js';

function parseDateOnlyString(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day);
}

export function nowInTimezone(timezone = 'UTC') {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
    const y = pick('year');
    const m = pick('month');
    const d = pick('day');
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
  } catch {
    // fallback to local clock
  }
  const fallback = new Date();
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

export function toDateOnly(value) {
  const parsed = parseDateOnlyString(value);
  const d = parsed || new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateOnly(value) {
  const d = toDateOnly(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addInterval(dateInput, rule) {
  const date = toDateOnly(dateInput);
  const every = Math.max(1, Number(rule?.every || 1));
  const unit = rule?.unit || 'days';

  if (unit === 'weeks') {
    date.setDate(date.getDate() + every * 7);
  } else if (unit === 'months') {
    const day = date.getDate();
    const target = new Date(date.getFullYear(), date.getMonth() + every, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return formatDateOnly(target);
  } else {
    date.setDate(date.getDate() + every);
  }
  return formatDateOnly(date);
}

export function createOccurrenceFromTemplate(template, dueDate, seedSuffix = '') {
  const seed = hashString(`${template.template_id}-${dueDate}-${seedSuffix}`);
  return {
    occurrence_id: `occ-${template.template_id}-${dueDate}-${seed}`,
    template_id: template.template_id,
    title: template.title,
    category: template.category,
    due_date: dueDate,
    due_time: template.default_time || null,
    assigned_to: template.assigned_to || null,
    status: 'pending',
    recurrence: template.recurrence || null,
    source: 'template',
    created_at: new Date().toISOString(),
    completed_at: null,
    notes: template.notes || '',
  };
}

export function projectTemplateOccurrences(templates, existingOccurrences, horizonDays = 90, fromDate = new Date()) {
  const horizonEnd = toDateOnly(fromDate);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  const existingKeys = new Set(
    (existingOccurrences || []).map((occ) => `${occ.template_id || 'none'}|${occ.due_date}`)
  );

  const generated = [];

  (templates || []).forEach((template) => {
    if (!template.recurrence) return;
    let cursor = formatDateOnly(template.start_date || fromDate);

    let guard = 0;
    while (guard < 400) {
      guard += 1;
      const cursorDate = toDateOnly(cursor);
      if (cursorDate > horizonEnd) break;
      if (cursorDate >= toDateOnly(fromDate)) {
        const key = `${template.template_id}|${cursor}`;
        if (!existingKeys.has(key)) {
          generated.push(createOccurrenceFromTemplate(template, cursor, `g-${guard}`));
          existingKeys.add(key);
        }
      }
      cursor = addInterval(cursor, template.recurrence);
    }
  });

  return generated;
}

export function markOccurrenceDone(occurrences, history, occurrenceId, completedAt = new Date()) {
  const completedIso = new Date(completedAt).toISOString();
  const completedDate = formatDateOnly(completedAt);
  const nextOccurrences = [];
  const existingTemplateDateKeys = new Set(
    (occurrences || []).map((occ) => `${occ.template_id || 'custom'}|${occ.due_date}`)
  );

  const updatedOccurrences = (occurrences || []).map((occ) => {
    if (occ.occurrence_id !== occurrenceId) return occ;

    const updated = {
      ...occ,
      status: 'done',
      completed_at: completedIso,
    };

    if (occ.recurrence) {
      const anchorDate = occ.recurrence_anchor === 'due_date' ? (occ.due_date || completedDate) : completedDate;
      const nextDueDate = addInterval(anchorDate, occ.recurrence);
      const key = `${occ.template_id || 'custom'}|${nextDueDate}`;
      if (!existingTemplateDateKeys.has(key)) {
        const nextOccurrence = {
          ...occ,
          occurrence_id: `occ-${occ.template_id || 'custom'}-${nextDueDate}-${hashString(`${occ.occurrence_id}-${nextDueDate}`)}`,
          due_date: nextDueDate,
          status: 'pending',
          completed_at: null,
          created_at: completedIso,
        };
        nextOccurrences.push(nextOccurrence);
        existingTemplateDateKeys.add(key);
      }
    }

    return updated;
  });

  const completionRecord = {
    history_id: `hist-${occurrenceId}-${Date.now()}`,
    occurrence_id: occurrenceId,
    action: 'done',
    timestamp: completedIso,
  };

  return {
    occurrences: [...updatedOccurrences, ...nextOccurrences],
    history: [...(history || []), completionRecord],
  };
}

export function markOccurrenceSkipped(occurrences, history, occurrenceId, skippedAt = new Date()) {
  const skippedIso = new Date(skippedAt).toISOString();
  const updated = (occurrences || []).map((occ) =>
    occ.occurrence_id === occurrenceId
      ? { ...occ, status: 'skipped', completed_at: skippedIso }
      : occ
  );

  return {
    occurrences: updated,
    history: [
      ...(history || []),
      {
        history_id: `hist-skip-${occurrenceId}-${Date.now()}`,
        occurrence_id: occurrenceId,
        action: 'skipped',
        timestamp: skippedIso,
      },
    ],
  };
}

export function addCustomOccurrence(occurrences, input) {
  const dueDate = formatDateOnly(input.due_date || new Date());
  const idSeed = hashString(`${input.title}-${dueDate}-${Date.now()}`);
  const occurrence = {
    occurrence_id: `occ-custom-${idSeed}`,
    template_id: null,
    title: input.title,
    category: input.category || 'custom',
    due_date: dueDate,
    due_time: input.due_time || null,
    assigned_to: input.assigned_to || null,
    status: 'pending',
    recurrence: input.recurrence || null,
    source: 'custom',
    created_at: new Date().toISOString(),
    completed_at: null,
    notes: input.notes || '',
  };
  return [...(occurrences || []), occurrence];
}

export function tasksByDate(occurrences, date) {
  const day = formatDateOnly(date);
  return (occurrences || [])
    .filter((occ) => occ.due_date === day)
    .sort((a, b) => {
      if ((a.due_time || '') !== (b.due_time || '')) {
        return (a.due_time || '').localeCompare(b.due_time || '');
      }
      return a.title.localeCompare(b.title);
    });
}

export function upcomingTasks(occurrences, days = 7, fromDate = new Date()) {
  const startDate = toDateOnly(fromDate);
  const start = startDate.getTime();
  const end = toDateOnly(fromDate);
  end.setDate(end.getDate() + Math.max(0, days - 1));
  const endMs = end.getTime();

  return (occurrences || [])
    .filter((occ) => {
      if (occ.status !== 'pending') return false;
      const ms = toDateOnly(occ.due_date).getTime();
      return ms >= start && ms <= endMs;
    })
    .sort((a, b) => toDateOnly(a.due_date).getTime() - toDateOnly(b.due_date).getTime());
}

export function tasksByOffsetRange(occurrences, fromDate = new Date(), minOffsetDays = 7, maxOffsetDays = 120) {
  const origin = toDateOnly(fromDate).getTime();
  return (occurrences || [])
    .filter((occ) => occ.status === 'pending')
    .filter((occ) => {
      const dueMs = toDateOnly(occ.due_date).getTime();
      const offset = Math.round((dueMs - origin) / 86400000);
      return offset >= minOffsetDays && offset <= maxOffsetDays;
    })
    .sort((a, b) => toDateOnly(a.due_date).getTime() - toDateOnly(b.due_date).getTime());
}
