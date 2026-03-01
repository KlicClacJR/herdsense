import assert from 'node:assert/strict';
import {
  addInterval,
  formatDateOnly,
  markOccurrenceDone,
  nowInTimezone,
  tasksByOffsetRange,
  upcomingTasks,
} from '../src/engines/calendarEngine.js';

function buildDate(offsetDays, baseDate) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return formatDateOnly(d);
}

function run() {
  const today = nowInTimezone('America/New_York');
  const dueToday = buildDate(0, today);
  const dueIn7 = buildDate(6, today);
  const dueIn8thDay = buildDate(7, today);
  const dueIn61 = buildDate(61, today);

  const occurrences = [
    { occurrence_id: 'a', due_date: dueToday, status: 'pending', title: 'today', category: 'hoof' },
    { occurrence_id: 'b', due_date: dueIn7, status: 'pending', title: 'day-7', category: 'hoof' },
    { occurrence_id: 'c', due_date: dueIn8thDay, status: 'pending', title: 'day-8', category: 'hoof' },
    { occurrence_id: 'd', due_date: dueIn61, status: 'pending', title: 'day-61', category: 'vaccine' },
  ];

  const week = upcomingTasks(occurrences, 7, today);
  assert.equal(week.some((item) => item.occurrence_id === 'c'), false, 'Upcoming week should only include next 7 days');
  assert.equal(week.some((item) => item.occurrence_id === 'a'), true, 'Upcoming week should include today');

  const suggested = tasksByOffsetRange(occurrences, today, 7, 120);
  assert.equal(suggested.some((item) => item.occurrence_id === 'c'), true, 'Suggested list should start immediately after week window');
  assert.equal(suggested.some((item) => item.occurrence_id === 'b'), false, 'Suggested list should exclude upcoming-week items');

  const recurringDue = dueToday;
  const recurringNext = addInterval(recurringDue, { every: 7, unit: 'days' });
  const recurring = [
    {
      occurrence_id: 'r-1',
      template_id: 'tmpl-water',
      due_date: recurringDue,
      status: 'pending',
      recurrence: { every: 7, unit: 'days' },
      title: 'water',
      category: 'water',
    },
    {
      occurrence_id: 'r-2',
      template_id: 'tmpl-water',
      due_date: recurringNext,
      status: 'pending',
      recurrence: { every: 7, unit: 'days' },
      title: 'water',
      category: 'water',
    },
  ];

  const done = markOccurrenceDone(recurring, [], 'r-1', today);
  const duplicateCount = done.occurrences.filter(
    (row) => row.template_id === 'tmpl-water' && row.due_date === recurringNext
  ).length;
  assert.equal(duplicateCount, 1, 'Mark done should not duplicate the next recurring occurrence');

  console.log('calendar_engine tests passed');
}

run();
