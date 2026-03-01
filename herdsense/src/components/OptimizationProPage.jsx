import { Fragment, useEffect, useMemo, useState } from 'react';
import { computeOptimization } from '../engines/optimization_engine';
import { DEMO_PLANNING_WHITELIST_TAGS, MILKING_FREQUENCIES, TASK_CATEGORIES } from '../data/constants';
import { nowInTimezone, tasksByDate } from '../engines/calendarEngine';
import { CowCard, ExpandableDetails, KpiCard, RecommendationCard, SectionHeader } from './pro/OptimizationUi';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtMoney(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `$${Number(value).toFixed(2)}`;
}

function dateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMonthGrid(monthDate, taskOccurrences) {
  const d = new Date(monthDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekday = first.getDay();
  const daysInMonth = last.getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push({ empty: true, key: `empty-${i}` });

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = dateInputValue(date);
    const count = (taskOccurrences || []).filter((task) => task.due_date === key && task.status === 'pending').length;
    cells.push({ empty: false, key, day, date, count });
  }
  return cells;
}

function sortProfitCards(cards, sortKey) {
  const rows = [...cards];
  if (sortKey === 'highest_cost') {
    return rows.sort((a, b) => (b.estimated_cost_day || 0) - (a.estimated_cost_day || 0));
  }
  if (sortKey === 'lowest_efficiency') {
    return rows.sort((a, b) => (a.efficiency_7 ?? 999) - (b.efficiency_7 ?? 999));
  }
  if (sortKey === 'declining') {
    const rank = { Declining: 0, Stable: 1, Improving: 2 };
    return rows.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
  }
  if (sortKey === 'sale_soon') {
    return rows.sort((a, b) => (a.days_to_sale ?? 9999) - (b.days_to_sale ?? 9999));
  }
  return rows;
}

export default function OptimizationProPage({
  cows,
  todaySignalsByTag,
  historyByTag,
  baselinesByTag,
  settings,
  insights,
  taskOccurrences,
  taskHistory,
  onTogglePro,
  onUpdateSetting,
  onUpdateMilk,
  onMarkTaskDone,
  onMarkTaskSkipped,
  onAddCustomTask,
  onAddMilkingReminders,
  onGenerateRecommendedTasks,
  onUpdateCowMilkingOverride,
  onUpdateCow,
}) {
  const todayRef = useMemo(() => nowInTimezone(settings.timezone || 'UTC'), [settings.timezone]);
  const [selectedDate, setSelectedDate] = useState(dateInputValue(todayRef));
  const [calendarMonth, setCalendarMonth] = useState(new Date(todayRef.getFullYear(), todayRef.getMonth(), 1));
  const [profitSort, setProfitSort] = useState('declining');
  const [profitSearch, setProfitSearch] = useState('');
  const [showAllLeaks, setShowAllLeaks] = useState(false);
  const [planningEditByCow, setPlanningEditByCow] = useState({});
  const [addSaleDateByCow, setAddSaleDateByCow] = useState({});
  const [customTask, setCustomTask] = useState({
    title: '',
    category: 'custom',
    due_date: dateInputValue(todayRef),
    due_time: '',
    recurrence_every: '',
    recurrence_unit: 'days',
    assigned_to: '',
    notes: '',
  });

  const data = useMemo(
    () => computeOptimization(
      cows,
      todaySignalsByTag,
      historyByTag,
      baselinesByTag,
      settings,
      insights,
      taskOccurrences
    ),
    [cows, todaySignalsByTag, historyByTag, baselinesByTag, settings, insights, taskOccurrences]
  );

  const monthCells = useMemo(() => buildMonthGrid(calendarMonth, taskOccurrences), [calendarMonth, taskOccurrences]);
  const tasksOnSelectedDate = useMemo(() => tasksByDate(taskOccurrences, selectedDate), [taskOccurrences, selectedDate]);
  const todayKey = dateInputValue(todayRef);
  const tomorrow = new Date(todayRef);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dateInputValue(tomorrow);
  const tasksToday = useMemo(() => tasksByDate(taskOccurrences, todayKey), [taskOccurrences, todayKey]);
  const tasksTomorrow = useMemo(() => tasksByDate(taskOccurrences, tomorrowKey), [taskOccurrences, tomorrowKey]);

  const profitCards = useMemo(() => {
    const sorted = sortProfitCards(data.cowProfitCards || [], profitSort);
    const q = profitSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((item) =>
      `${item.name || ''} ${item.ear_tag_id || ''}`.toLowerCase().includes(q)
    );
  }, [data.cowProfitCards, profitSort, profitSearch]);

  const monthLabel = useMemo(
    () => calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    [calendarMonth]
  );

  const leakCards = useMemo(
    () => (showAllLeaks ? data.weeklyMoneyReport.money_leaks : data.weeklyMoneyReport.money_leaks.slice(0, 3)),
    [data.weeklyMoneyReport.money_leaks, showAllLeaks]
  );
  const totalLeakCount = data.weeklyMoneyReport.money_leaks.length;
  const canExpandLeaks = totalLeakCount > 3;
  const noMajorLeaks = totalLeakCount === 1
    && (data.weeklyMoneyReport.money_leaks?.[0]?.title || '').toLowerCase().includes('no major money leaks');

  useEffect(() => {
    if (!canExpandLeaks && showAllLeaks) {
      setShowAllLeaks(false);
    }
  }, [canExpandLeaks, showAllLeaks]);

  const daysFeedTrend = data.weeklyMoneyReport.feed_spend_change_pct == null
    ? null
    : Number((-data.weeklyMoneyReport.feed_spend_change_pct).toFixed(1));
  const sevenDayFeedCost = (data.inventoryPlanning.burn_rate_kg_day || 0) * (settings.feed_cost_per_kg || 0) * 7;

  const shiftMonth = (delta) => {
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
    setCalendarMonth(nextMonth);
  };

  const scrollToMilkEntry = () => {
    const el = document.getElementById('quick-milk-entry');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitCustomTask = () => {
    if (!customTask.title.trim()) return;
    const recurrence = customTask.recurrence_every
      ? { every: Math.max(1, Number(customTask.recurrence_every)), unit: customTask.recurrence_unit }
      : null;

    onAddCustomTask({
      title: customTask.title.trim(),
      category: customTask.category,
      due_date: customTask.due_date || selectedDate,
      due_time: customTask.due_time || null,
      recurrence,
      assigned_to: customTask.assigned_to || null,
      notes: customTask.notes || '',
    });
    setCustomTask((prev) => ({ ...prev, title: '', notes: '', recurrence_every: '' }));
  };

  const updateCowPlanning = (cowId, field, value) => {
    if (!onUpdateCow) return;
    onUpdateCow(cowId, { [field]: value || null });
  };

  const startPlanningEdit = (cow, forecast) => {
    setPlanningEditByCow((prev) => ({
      ...prev,
      [cow.cow_id]: {
        planned_cull_or_sale_date: cow.planned_cull_or_sale_date ? cow.planned_cull_or_sale_date.slice(0, 10) : '',
        manual_feed_kg_per_day: cow.manual_feed_kg_per_day ?? '',
        expected_sale_value: cow.expected_sale_value ?? '',
        feed_intake_mode: cow.feed_intake_mode || 'inherit',
        current_feed_preview: forecast?.current_estimated_feed_kg_day ?? null,
      },
    }));
  };

  const cancelPlanningEdit = (cowId) => {
    setPlanningEditByCow((prev) => {
      const next = { ...prev };
      delete next[cowId];
      return next;
    });
  };

  const savePlanningEdit = (cowId) => {
    const draft = planningEditByCow[cowId];
    if (!draft || !onUpdateCow) return;
    onUpdateCow(cowId, {
      planned_cull_or_sale_date: draft.planned_cull_or_sale_date || null,
      manual_feed_kg_per_day: draft.manual_feed_kg_per_day === '' ? null : draft.manual_feed_kg_per_day,
      expected_sale_value: draft.expected_sale_value === '' ? null : draft.expected_sale_value,
      feed_intake_mode: draft.feed_intake_mode || 'inherit',
    });
    cancelPlanningEdit(cowId);
  };

  const cowsWithoutSaleDate = useMemo(
    () => (settings.demo_mode ? [] : cows.filter((cow) => !cow.planned_cull_or_sale_date)),
    [cows, settings.demo_mode]
  );
  const salePlanningForecasts = useMemo(() => {
    const rows = data.inventoryPlanning.forecasts || [];
    if (!settings.demo_mode) return rows;
    const allowed = new Set(settings.demo_sale_planning_whitelist || DEMO_PLANNING_WHITELIST_TAGS);
    return rows.filter((row) => allowed.has(row.ear_tag_id));
  }, [data.inventoryPlanning.forecasts, settings.demo_mode, settings.demo_sale_planning_whitelist]);

  return (
    <div className="screen pro-screen">
      <header className="screen-header">
        <div>
          <h1>💰 Optimization (Pro): Farm Business Hub</h1>
          <p className="subtext">See your money picture quickly and decide what to do next.</p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={Boolean(settings.is_pro)} onChange={(e) => onTogglePro(e.target.checked)} />
          <span>{settings.is_pro ? 'Pro enabled' : 'Pro preview'}</span>
        </label>
      </header>

      {!settings.is_pro && (
        <section className="panel locked-panel">
          <h2>Upgrade to Pro</h2>
          <p>Enable Pro in demo mode to unlock money snapshots, leaks, profit cards, planning, and scheduling.</p>
        </section>
      )}

      {settings.is_pro && (
        <>
          <section className="panel snapshot-panel">
            <SectionHeader title="💰 Weekly Money Snapshot" subtitle="This week at a glance" />
            <div className="kpi-grid snapshot-banner">
              <KpiCard
                icon="🌾"
                title="Feed Spend (Est.)"
                value={fmtMoney(data.weeklyMoneyReport.feed_spend_week)}
                trend={data.weeklyMoneyReport.feed_spend_change_pct}
              />
              <KpiCard
                icon="🥛"
                title="Milk Revenue"
                value={fmtMoney(data.weeklyMoneyReport.milk_revenue_week)}
                trend={data.weeklyMoneyReport.milk_revenue_change_pct}
                missingText={data.weeklyMoneyReport.milk_revenue_week == null ? 'Add data' : null}
                onAddData={scrollToMilkEntry}
              />
              <KpiCard
                icon="💰"
                title="Profit (Est.)"
                value={fmtMoney(data.weeklyMoneyReport.weekly_profit)}
                trend={data.weeklyMoneyReport.weekly_profit_change_pct}
                missingText={data.weeklyMoneyReport.weekly_profit == null ? 'Add data' : null}
                onAddData={scrollToMilkEntry}
              />
              <KpiCard
                icon="📦"
                title="Days of Feed Left"
                value={data.inventoryPlanning.days_of_feed_remaining == null ? '—' : `${data.inventoryPlanning.days_of_feed_remaining} days`}
                trend={daysFeedTrend}
                missingText={data.inventoryPlanning.days_of_feed_remaining == null ? 'Add data' : null}
              />
            </div>
          </section>

          <section className="panel">
            <SectionHeader
              title="Top Money Leaks"
              subtitle={canExpandLeaks ? 'Top 3 right now. Expand for full list.' : 'Most important savings opportunities right now'}
              actions={canExpandLeaks ? (
                <button type="button" className="btn-secondary" onClick={() => setShowAllLeaks((prev) => !prev)}>
                  {showAllLeaks ? 'Show top 3' : `Show all (${totalLeakCount})`}
                </button>
              ) : null}
            />
            {noMajorLeaks && <p className="empty-note">No big leaks detected this week 👍</p>}
            {!noMajorLeaks && (
              <div className="recommendation-grid leaks-grid leaks-row">
                {leakCards.map((leak) => (
                  <RecommendationCard key={leak.id} leak={leak} />
                ))}
              </div>
            )}
          </section>

          <section className="panel" id="quick-milk-entry">
            <SectionHeader
              title="Cow Profit Cards"
              subtitle="Scan each cow quickly and act on declines first"
              actions={(
                <label>
                  Sort by
                  <select value={profitSort} onChange={(e) => setProfitSort(e.target.value)}>
                    <option value="declining">Declining first</option>
                    <option value="highest_cost">Highest cost/day</option>
                    <option value="lowest_efficiency">Lowest efficiency</option>
                    <option value="sale_soon">Sale date approaching</option>
                  </select>
                </label>
              )}
            />
            <div className="manager-toolbar">
              <input
                type="text"
                value={profitSearch}
                onChange={(e) => setProfitSearch(e.target.value)}
                placeholder="Search by name or ear tag"
              />
            </div>
            <div className="recommendation-grid">
              {profitCards.map((card) => (
                <CowCard key={card.cow_id} card={card} />
              ))}
              {!profitCards.length && <p className="subtext">No cows match the current search.</p>}
            </div>

            <ExpandableDetails label="Quick milk entry (today)">
              <div className="table-wrap">
                <table className="signal-table">
                  <thead>
                    <tr>
                      <th>Cow</th>
                      <th>Ear tag</th>
                      <th>Estimated feed intake (kg/day)</th>
                      <th>Estimated cost/day</th>
                      <th>Milk liters/day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.feedRows.map((row) => (
                      <tr key={row.cow_id}>
                        <td>{row.name}</td>
                        <td>{row.ear_tag_id}</td>
                        <td title="Estimated from feeding-station behavior when a scale is not available.">
                          {row.estimated_feed_kg_day.toFixed(2)} {row.feed_source === 'manual' ? '(Manual)' : '(Estimated)'}
                        </td>
                        <td>{fmtMoney(row.estimated_cost_day)}</td>
                        <td>
                          {row.production_type === 'dairy' ? (
                            <input
                              type="number"
                              className="table-input"
                              min="0"
                              step="0.1"
                              value={row.output_day_liters ?? ''}
                              onChange={(e) => onUpdateMilk(row.cow_id, e.target.value)}
                            />
                          ) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ExpandableDetails>
          </section>

          <section className="panel">
            <SectionHeader title="📦 Inventory & Planning" subtitle="Keep feed and sale plans clear and practical" />
            <div className="grid-two">
              <article className="card-soft">
                <h3>Inputs</h3>
                <div className="settings-row two-col">
                  <label>
                    Feed inventory (kg)
                    <input type="number" value={settings.available_feed_kg_current ?? ''} onChange={(e) => onUpdateSetting('available_feed_kg_current', e.target.value)} />
                  </label>
                  <label>
                    Feed cost per kg ($)
                    <input type="number" step="0.01" value={settings.feed_cost_per_kg ?? ''} onChange={(e) => onUpdateSetting('feed_cost_per_kg', e.target.value)} />
                  </label>
                  <label>
                    Milk price per liter ($)
                    <input type="number" step="0.01" value={settings.milk_price_per_liter ?? ''} onChange={(e) => onUpdateSetting('milk_price_per_liter', e.target.value)} />
                  </label>
                  <label>
                    Daily feed budget cap ($)
                    <input type="number" step="1" value={settings.daily_feed_budget_cap ?? ''} onChange={(e) => onUpdateSetting('daily_feed_budget_cap', e.target.value)} />
                  </label>
                </div>
              </article>
              <article className="card-soft">
                <h3>Outputs</h3>
                <p><strong>Burn rate:</strong> {data.inventoryPlanning.burn_rate_kg_day} kg/day</p>
                <p><strong>Days remaining:</strong> {data.inventoryPlanning.days_of_feed_remaining ?? 'N/A'}</p>
                <p><strong>Projected feed cost (next 7 days):</strong> {fmtMoney(sevenDayFeedCost)}</p>
              </article>
            </div>

            <ExpandableDetails label="Per-cow sale/cull planning">
              <div className="table-wrap">
                <table className="signal-table">
                  <thead>
                    <tr>
                      <th>Cow</th>
                      <th>Sale/cull date</th>
                      <th>Days left</th>
                      <th>Current feed/day</th>
                      <th>Suggested feed/day</th>
                      <th>Plan</th>
                      <th>Projected feed cost</th>
                      <th title="Estimates based on feed costs, production trends, and conservative risk assumptions.">
                        Estimated monthly impact
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {salePlanningForecasts.map((forecast) => {
                      const cow = cows.find((item) => item.cow_id === forecast.cow_id) || {};
                      const draft = planningEditByCow[cow.cow_id];
                      const sourceLabel = forecast.current_feed_source === 'manual' ? 'Manual' : 'Estimated';
                      const sourceTitle = sourceLabel === 'Estimated'
                        ? 'Estimated from feeder behavior (time at trough + meal count)'
                        : 'Farmer-entered manual value';
                      return (
                        <Fragment key={cow.cow_id}>
                          <tr key={cow.cow_id}>
                            <td>{cow.name || cow.cow_id} ({cow.ear_tag_id})</td>
                            <td>{forecast.planned_sale_or_cull_date ? forecast.planned_sale_or_cull_date.slice(0, 10) : '—'}</td>
                            <td>{forecast.days_to_sale}</td>
                            <td title={sourceTitle}>
                              {forecast.current_estimated_feed_kg_day} kg
                              <div className="subtext">({sourceLabel})</div>
                            </td>
                            <td>{`${forecast.suggested_feed_kg_day} kg (${forecast.suggested_change_pct > 0 ? '+' : ''}${forecast.suggested_change_pct}%)`}</td>
                            <td>
                              <strong>{forecast.plan_label || forecast.suggestion}</strong>
                              <div className="subtext">{forecast.note}</div>
                              <button type="button" className="btn-secondary" onClick={() => startPlanningEdit(cow, forecast)}>
                                Edit inputs
                              </button>
                            </td>
                            <td>
                              <strong>{fmtMoney(forecast.projected_feed_cost_until_sale)}</strong>
                              <details>
                                <summary>Details</summary>
                                <div className="subtext">Current plan: {fmtMoney(forecast.projected_feed_cost_current_plan)}</div>
                                <div className="subtext">Suggested plan: {fmtMoney(forecast.projected_feed_cost_until_sale)}</div>
                              </details>
                            </td>
                            <td>
                              <strong>{forecast.monthly_impact_summary || forecast.monthly_money_saved_range || 'N/A'}</strong>
                              {forecast.impact_note && <div className="subtext">{forecast.impact_note}</div>}
                            </td>
                          </tr>
                          {draft && (
                            <tr>
                              <td colSpan={8}>
                                <div className="settings-row two-col">
                                  <label>
                                    Sale/cull date
                                    <input
                                      type="date"
                                      value={draft.planned_cull_or_sale_date}
                                      onChange={(e) => setPlanningEditByCow((prev) => ({
                                        ...prev,
                                        [cow.cow_id]: { ...prev[cow.cow_id], planned_cull_or_sale_date: e.target.value },
                                      }))}
                                    />
                                  </label>
                                  <label>
                                    Feed intake mode
                                    <select
                                      value={draft.feed_intake_mode}
                                      onChange={(e) => setPlanningEditByCow((prev) => ({
                                        ...prev,
                                        [cow.cow_id]: { ...prev[cow.cow_id], feed_intake_mode: e.target.value },
                                      }))}
                                    >
                                      <option value="inherit">inherit</option>
                                      <option value="manual">manual</option>
                                      <option value="estimated">estimated</option>
                                      <option value="hybrid">hybrid</option>
                                    </select>
                                  </label>
                                  <label>
                                    Manual feed (kg/day)
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={draft.manual_feed_kg_per_day}
                                      onChange={(e) => setPlanningEditByCow((prev) => ({
                                        ...prev,
                                        [cow.cow_id]: { ...prev[cow.cow_id], manual_feed_kg_per_day: e.target.value },
                                      }))}
                                    />
                                  </label>
                                  <label>
                                    Expected sale value ($, optional)
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draft.expected_sale_value}
                                      onChange={(e) => setPlanningEditByCow((prev) => ({
                                        ...prev,
                                        [cow.cow_id]: { ...prev[cow.cow_id], expected_sale_value: e.target.value },
                                      }))}
                                    />
                                  </label>
                                </div>
                                <div className="header-actions">
                                  <button type="button" className="btn-primary" onClick={() => savePlanningEdit(cow.cow_id)}>Save</button>
                                  <button type="button" className="btn-secondary" onClick={() => cancelPlanningEdit(cow.cow_id)}>Cancel</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!salePlanningForecasts.length && (
                      <tr>
                        <td colSpan={8}>No cows with sale/cull dates yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!!cowsWithoutSaleDate.length && (
                <>
                  <h4>Add sale/cull date</h4>
                  <div className="table-wrap">
                    <table className="signal-table">
                      <thead>
                        <tr>
                          <th>Cow</th>
                          <th>Sale/cull date</th>
                          <th>Save</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cowsWithoutSaleDate.map((cow) => (
                          <tr key={`add-sale-${cow.cow_id}`}>
                            <td>{cow.name || cow.cow_id} ({cow.ear_tag_id})</td>
                            <td>
                              <input
                                type="date"
                                value={addSaleDateByCow[cow.cow_id] || ''}
                                onChange={(e) => setAddSaleDateByCow((prev) => ({ ...prev, [cow.cow_id]: e.target.value }))}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => updateCowPlanning(cow.cow_id, 'planned_cull_or_sale_date', addSaleDateByCow[cow.cow_id])}
                                disabled={!addSaleDateByCow[cow.cow_id]}
                              >
                                Add date
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </ExpandableDetails>
          </section>

          <section className="panel">
            <SectionHeader
              title="📅 Schedule & Reminders"
              subtitle="Today/Tomorrow tasks on the left, month calendar on the right"
              actions={(
                <div className="header-actions">
                  <button type="button" className="btn-secondary" onClick={() => onGenerateRecommendedTasks?.(60)}>
                    Generate recommended tasks
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => onAddMilkingReminders(data.milking.reminders)}>
                    Apply milking schedule
                  </button>
                </div>
              )}
            />

            <div className="settings-row">
              <label>
                Milking frequency
                <select value={settings.milking_frequency} onChange={(e) => onUpdateSetting('milking_frequency', e.target.value)}>
                  {MILKING_FREQUENCIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Schedule mode
                <select value={settings.milking_schedule_mode || 'same_for_all'} onChange={(e) => onUpdateSetting('milking_schedule_mode', e.target.value)}>
                  <option value="same_for_all">Same for all cows</option>
                  <option value="per_cow">Per-cow overrides</option>
                </select>
              </label>
              <label>
                Morning start
                <input type="time" value={settings.morning_window_start || ''} onChange={(e) => onUpdateSetting('morning_window_start', e.target.value)} />
              </label>
              <label>
                Midday start
                <input type="time" value={settings.midday_window_start || ''} onChange={(e) => onUpdateSetting('midday_window_start', e.target.value)} />
              </label>
              <label>
                Evening start
                <input type="time" value={settings.evening_window_start || ''} onChange={(e) => onUpdateSetting('evening_window_start', e.target.value)} />
              </label>
            </div>

            {settings.milking_schedule_mode === 'per_cow' && (
              <div className="table-wrap">
                <table className="signal-table">
                  <thead>
                    <tr>
                      <th>Cow</th>
                      <th>Ear tag</th>
                      <th>Frequency override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cows.filter((cow) => cow.production_type === 'dairy').map((cow) => (
                      <tr key={cow.cow_id}>
                        <td>{cow.name || cow.cow_id}</td>
                        <td>{cow.ear_tag_id}</td>
                        <td>
                          <select
                            value={settings.milking_overrides?.[cow.cow_id]?.frequency || cow.target_milking_frequency || ''}
                            onChange={(e) => onUpdateCowMilkingOverride(cow.cow_id, e.target.value)}
                          >
                            <option value="">Use default</option>
                            {MILKING_FREQUENCIES.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid-two schedule-split">
              <article className="card-soft">
                <h3>Today ({todayKey})</h3>
                <ul className="task-list">
                  {tasksToday.map((task) => (
                    <li key={`today-${task.occurrence_id}`}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.category} • {task.due_time || 'all day'}</span>
                      </div>
                    </li>
                  ))}
                  {!tasksToday.length && <li>No tasks today.</li>}
                </ul>
                <h3>Tomorrow ({tomorrowKey})</h3>
                <ul className="task-list">
                  {tasksTomorrow.map((task) => (
                    <li key={`tomorrow-${task.occurrence_id}`}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.category} • {task.due_time || 'all day'}</span>
                      </div>
                    </li>
                  ))}
                  {!tasksTomorrow.length && <li>No tasks tomorrow.</li>}
                </ul>
              </article>

              <article className="card-soft">
                <div className="calendar-nav">
                  <button type="button" className="btn-secondary" onClick={() => shiftMonth(-1)}>Previous</button>
                  <strong>{monthLabel}</strong>
                  <button type="button" className="btn-secondary" onClick={() => shiftMonth(1)}>Next</button>
                </div>
                <div className="weekday-row">
                  {WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="calendar-grid">
                  {monthCells.map((cell) => {
                    if (cell.empty) return <div key={cell.key} className="calendar-cell empty" />;
                    const isSelected = cell.key === selectedDate;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        className={`calendar-cell ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedDate(cell.key)}
                      >
                        <span>{cell.day}</span>
                        {cell.count > 0 && <small>{cell.count}</small>}
                      </button>
                    );
                  })}
                </div>

                <h3>Tasks on {selectedDate}</h3>
                <ul className="task-list">
                  {tasksOnSelectedDate.map((task) => (
                    <li key={task.occurrence_id} className={task.status === 'done' ? 'task-done' : task.status === 'skipped' ? 'task-skipped' : ''}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.category} • {task.due_time || 'all day'} • {task.status}</span>
                      </div>
                      {task.status === 'pending' && (
                        <div className="task-actions">
                          <button type="button" className="btn-secondary" onClick={() => onMarkTaskDone(task.occurrence_id)}>Done</button>
                          <button type="button" className="btn-secondary" onClick={() => onMarkTaskSkipped(task.occurrence_id)}>Skip</button>
                        </div>
                      )}
                    </li>
                  ))}
                  {!tasksOnSelectedDate.length && <li>No tasks for this date.</li>}
                </ul>
              </article>
            </div>

            <ExpandableDetails label="Add custom task">
              <div className="custom-task-grid">
                <label>
                  Title
                  <input type="text" value={customTask.title} onChange={(e) => setCustomTask((prev) => ({ ...prev, title: e.target.value }))} />
                </label>
                <label>
                  Category
                  <select value={customTask.category} onChange={(e) => setCustomTask((prev) => ({ ...prev, category: e.target.value }))}>
                    {TASK_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </label>
                <label>
                  Due date
                  <input type="date" value={customTask.due_date} onChange={(e) => setCustomTask((prev) => ({ ...prev, due_date: e.target.value }))} />
                </label>
                <label>
                  Time
                  <input type="time" value={customTask.due_time} onChange={(e) => setCustomTask((prev) => ({ ...prev, due_time: e.target.value }))} />
                </label>
                <label>
                  Recurrence every
                  <input type="number" min="1" value={customTask.recurrence_every} onChange={(e) => setCustomTask((prev) => ({ ...prev, recurrence_every: e.target.value }))} />
                </label>
                <label>
                  Unit
                  <select value={customTask.recurrence_unit} onChange={(e) => setCustomTask((prev) => ({ ...prev, recurrence_unit: e.target.value }))}>
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                    <option value="months">months</option>
                  </select>
                </label>
                <label className="full-width">
                  Notes
                  <textarea rows={2} value={customTask.notes} onChange={(e) => setCustomTask((prev) => ({ ...prev, notes: e.target.value }))} />
                </label>
              </div>
              <button type="button" className="btn-secondary" onClick={submitCustomTask}>Add task</button>
              <p className="subtext">Completion history entries: {taskHistory.length}</p>
            </ExpandableDetails>
          </section>

          <section className="panel">
            <SectionHeader title="Resource Efficiency" subtitle="One quick status with a clear next action" />
            <article className="card-soft">
              <p><strong>Feeding congestion:</strong> {(data.resourcePlanning.level || 'unknown').toUpperCase()}</p>
              <p>{data.resourcePlanning.interpretation}</p>
              <p><strong>Suggested action:</strong> {(data.resourcePlanning.actions || [])[0] || 'No action needed right now.'}</p>
              <ExpandableDetails label="Details">
                <p>{data.resourcePlanning.explanation}</p>
                <p><strong>Peak windows ({data.resourcePlanning.timezone}):</strong> {data.resourcePlanning.peak_windows.join(', ') || 'N/A'}</p>
                <p><strong>Average cows at feeder:</strong> {data.resourcePlanning.avg_cows_simultaneous ?? 'N/A'}</p>
              </ExpandableDetails>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
