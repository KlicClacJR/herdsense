import { useEffect, useMemo, useState } from 'react';
import ServiceTicketModal from './ServiceTicketModal';

const METRIC_ROWS = [
  ['trough_minutes_today', 'Trough minutes'],
  ['meals_count_today', 'Meals count'],
  ['avg_meal_minutes_today', 'Avg meal minutes'],
  ['feed_intake_est_kg_today', 'Estimated feed intake (kg)'],
  ['activity_index_today', 'Activity index'],
  ['alone_minutes_today', 'Alone minutes'],
  ['water_visits_today', 'Water visits'],
  ['lying_minutes_today', 'Lying minutes'],
  ['temp_c_today', 'Temperature (C)'],
  ['humidity_pct_today', 'Humidity (%)'],
];

const ISSUE_MAP = {
  camera_not_detecting: 'Camera not detecting cows',
  sensor_flatline: 'App showing incorrect data',
  incorrect_data: 'App showing incorrect data',
};

function fmt(value) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  const decimals = Math.abs(value) < 10 ? 2 : 1;
  return Number(value).toFixed(decimals);
}

function deltaPct(today, baseline) {
  if (today == null || baseline == null || baseline === 0) return null;
  return ((today - baseline) / baseline) * 100;
}

function badgeClass(statusKey) {
  if (statusKey === 'high') return 'badge-red';
  if (statusKey === 'moderate') return 'badge-yellow';
  return 'badge-green';
}

function factorLabel(key) {
  if (key === 'heat') return 'Heat-related';
  if (key === 'water') return 'Water-related';
  if (key === 'social') return 'Social/resource-related';
  return 'Illness/injury-related';
}

function shortReason(insight) {
  const first = (insight?.why_bullets || [])[0];
  if (!first) return 'No major change from usual today.';
  if (first.startsWith('Eating time -')) {
    const match = first.match(/-(\d+)%/);
    return `Eating ${match ? match[1] : ''}% less than usual`.trim();
  }
  if (first.startsWith('Water visits -')) {
    const match = first.match(/-(\d+)%/);
    return `Water visits down ${match ? `${match[1]}%` : ''}`.trim();
  }
  if (first.startsWith('Activity -')) {
    const match = first.match(/-(\d+)%/);
    return `Activity down ${match ? `${match[1]}%` : ''}`.trim();
  }
  if (first.startsWith('Lying time +')) {
    const match = first.match(/\+(\d+)%/);
    return `Lying time up ${match ? `${match[1]}%` : ''}`.trim();
  }
  if (first.includes('Hot and humid')) return 'Hotter and more humid than usual';
  return first;
}

function friendlyRiskNote(insight) {
  if (insight?.display_risk_band_key === 'high') return 'This has persisted — take action now.';
  if (insight?.display_risk_band_key === 'moderate') return 'Worth a quick look today.';
  return 'Normal daily variation so far.';
}

export default function HealthAlertsPage({
  cows,
  todaySignalsByTag,
  baselinesByTag,
  detectionsToday,
  alertsData,
  onSimulateDay,
  onAddDetectedTag,
  onResetDemo,
  onSetDemoMode,
  demoMode = false,
  baselineRecalibrationDaysLeft = 0,
  hardwareIssue,
  settings,
  lastSyncTime,
  onCreateServiceTicket,
}) {
  const [manualTag, setManualTag] = useState('');
  const [checked, setChecked] = useState({});
  const [sortBy, setSortBy] = useState('urgency');
  const [selectedFilters, setSelectedFilters] = useState(['active']);
  const [reportOpen, setReportOpen] = useState(false);
  const [issuePreset, setIssuePreset] = useState('');
  const [selectedCowId, setSelectedCowId] = useState('');

  const counts = useMemo(() => {
    const rows = alertsData.insights || [];
    return {
      active: cows.length,
      high: rows.filter((item) => item.display_risk_band_key === 'high').length,
      moderate: rows.filter((item) => item.display_risk_band_key === 'moderate').length,
      low: rows.filter((item) => item.display_risk_band_key === 'low').length,
    };
  }, [alertsData.insights, cows.length]);

  const filteredInsights = useMemo(() => {
    const rows = [...(alertsData.insights || [])];
    const filtered = rows.filter((insight) => {
      const cow = cows.find((item) => item.cow_id === insight.cow_id);
      const categories = [];
      if (cow?.is_active !== false) categories.push('active');
      categories.push(insight.display_risk_band_key || 'low');
      return selectedFilters.some((key) => categories.includes(key));
    });

    if (sortBy === 'name') {
      return filtered.sort((a, b) => {
        const cowA = cows.find((item) => item.cow_id === a.cow_id);
        const cowB = cows.find((item) => item.cow_id === b.cow_id);
        return `${cowA?.name || cowA?.cow_id || ''}`.localeCompare(`${cowB?.name || cowB?.cow_id || ''}`);
      });
    }
    if (sortBy === 'ear_tag') {
      return filtered.sort((a, b) => {
        const cowA = cows.find((item) => item.cow_id === a.cow_id);
        const cowB = cows.find((item) => item.cow_id === b.cow_id);
        return `${cowA?.ear_tag_id || ''}`.localeCompare(`${cowB?.ear_tag_id || ''}`);
      });
    }
    return filtered.sort((a, b) => (b.urgency_score || 0) - (a.urgency_score || 0));
  }, [alertsData.insights, cows, selectedFilters, sortBy]);

  useEffect(() => {
    if (!filteredInsights.length) {
      setSelectedCowId('');
      return;
    }
    if (!selectedCowId || !filteredInsights.some((item) => item.cow_id === selectedCowId)) {
      setSelectedCowId(filteredInsights[0].cow_id);
    }
  }, [filteredInsights, selectedCowId]);

  const selectedInsight = useMemo(
    () => filteredInsights.find((item) => item.cow_id === selectedCowId) || filteredInsights[0] || null,
    [filteredInsights, selectedCowId]
  );
  const selectedCow = useMemo(
    () => cows.find((item) => item.cow_id === selectedInsight?.cow_id) || null,
    [cows, selectedInsight]
  );
  const selectedSignal = selectedCow ? (todaySignalsByTag[selectedCow.ear_tag_id] || {}) : {};
  const selectedBaseline = selectedCow ? (baselinesByTag[selectedCow.ear_tag_id] || {}) : {};

  const toggleChip = (key) => {
    setSelectedFilters((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((item) => item !== key);
        return next.length ? next : ['active'];
      }
      if (prev.length >= 2) {
        return [...prev.slice(1), key];
      }
      return [...prev, key];
    });
  };

  const openReport = (preset = '') => {
    setIssuePreset(preset);
    setReportOpen(true);
  };

  const addManualTag = () => {
    if (!manualTag.trim()) return;
    onAddDetectedTag(manualTag.trim(), 'manual_confirm');
    setManualTag('');
  };

  return (
    <div className="screen health-screen">
      <header className="hero-strip">
        <div className="hero-copy">
          <h1>🐄 Health & Alerts</h1>
          <p className="hero-summary">
            {counts.high > 0
              ? `${counts.high} cow${counts.high === 1 ? '' : 's'} needs attention.`
              : counts.moderate > 0
                ? `${counts.moderate} cow${counts.moderate === 1 ? '' : 's'} worth a quick look.`
                : 'All good today ✅'}
          </p>
          <p className="subtext">See what changed today and what to check next.</p>
        </div>
        <div className="hero-actions">
          <label className="switch-row">
            <input type="checkbox" checked={Boolean(demoMode)} onChange={(e) => onSetDemoMode(e.target.checked)} />
            <span>Demo Mode</span>
          </label>
          <button type="button" className="btn-secondary" onClick={() => openReport()}>🛠 Report Issue</button>
          <button type="button" className="btn-primary" onClick={onSimulateDay}>Simulate day</button>
          <button type="button" className="btn-secondary" onClick={onResetDemo}>Reset demo</button>
        </div>
      </header>

      <section className="summary-strip">
        <div>
          <strong>{counts.high}</strong>
          <span>High risk</span>
        </div>
        <div>
          <strong>{counts.moderate}</strong>
          <span>Moderate risk</span>
        </div>
        <div>
          <strong>{counts.active}</strong>
          <span>Active cows</span>
        </div>
      </section>

      {baselineRecalibrationDaysLeft > 0 && (
        <section className="panel warning-panel">
          Baseline recalibration is active ({baselineRecalibrationDaysLeft} day(s) left). Risk confidence is temporarily reduced.
        </section>
      )}

      {hardwareIssue && (
        <section className="panel warning-panel">
          <div className="header-actions">
            <strong>{hardwareIssue.message}</strong>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => openReport(ISSUE_MAP[hardwareIssue.type] || 'App showing incorrect data')}
            >
              Report Issue
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="header-actions">
          <h2>Herd summary</h2>
          <label>
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="urgency">Urgency</option>
              <option value="ear_tag">Ear tag</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <div className="chips-wrap health-filter-chips">
          <button type="button" className={`chip ${selectedFilters.includes('high') ? 'active' : ''}`} onClick={() => toggleChip('high')}>
            High risk ({counts.high})
          </button>
          <button type="button" className={`chip ${selectedFilters.includes('moderate') ? 'active' : ''}`} onClick={() => toggleChip('moderate')}>
            Moderate risk ({counts.moderate})
          </button>
          <button type="button" className={`chip ${selectedFilters.includes('low') ? 'active' : ''}`} onClick={() => toggleChip('low')}>
            Low risk ({counts.low})
          </button>
          <button type="button" className={`chip ${selectedFilters.includes('active') ? 'active' : ''}`} onClick={() => toggleChip('active')}>
            Active cows ({counts.active})
          </button>
        </div>

        <div className="health-layout">
          <div className="health-list">
            {filteredInsights.map((insight) => {
              const cow = cows.find((item) => item.cow_id === insight.cow_id);
              const summary = shortReason(insight);
              const isActive = selectedInsight?.cow_id === insight.cow_id;
              return (
                <article key={insight.cow_id} className={`health-card compact ${isActive ? 'active' : ''}`}>
                  <div className="health-card-head">
                    <div>
                      <h3>{cow?.name || insight.cow_id}</h3>
                      <p className="subtext">Ear tag: {cow?.ear_tag_id}</p>
                    </div>
                    <span className={`risk-pill ${badgeClass(insight.display_risk_band_key)}`}>
                      {insight.display_risk_band_key === 'high' ? 'HIGH' : insight.display_risk_band_key === 'moderate' ? 'MODERATE' : 'LOW'}
                    </span>
                  </div>
                  <p className="risk-line">
                    Overall Health Risk: {insight.overall_risk_pct}% ({insight.display_risk_band || 'Low'})
                  </p>
                  <p className="risk-reason">{summary}</p>
                  <button type="button" className="btn-link" onClick={() => setSelectedCowId(insight.cow_id)}>
                    {isActive ? 'Viewing details' : 'View details'}
                  </button>
                </article>
              );
            })}
          </div>

          <aside className="panel health-detail-panel">
            {!selectedInsight && <p className="subtext">Select a cow to view details.</p>}
            {selectedInsight && (
              <>
                <div className="health-card-head">
                  <div>
                    <h3>{selectedCow?.name || selectedInsight.cow_id}</h3>
                    <p className="subtext">Ear tag: {selectedCow?.ear_tag_id}</p>
                  </div>
                  <span className={`risk-pill ${badgeClass(selectedInsight.display_risk_band_key)}`}>
                    {selectedInsight.display_risk_band_key === 'high' ? 'HIGH' : selectedInsight.display_risk_band_key === 'moderate' ? 'MODERATE' : 'LOW'}
                  </span>
                </div>
                <p className="risk-line">
                  Overall Health Risk: {selectedInsight.overall_risk_pct}% ({selectedInsight.display_risk_band || 'Low'})
                </p>
                <p className="subtext">{friendlyRiskNote(selectedInsight)}</p>
                {selectedInsight.display_subtitle && <p className="subtext">{selectedInsight.display_subtitle}</p>}
                {selectedInsight.trend_line && <p className="subtext">{selectedInsight.trend_line}</p>}

                <details className="health-detail-root" open>
                  <summary>What changed today</summary>
                  <ul>
                    {(selectedInsight.why_bullets || ['No unusual pattern found.']).map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </details>

                <details className="health-detail-root" open>
                  <summary>Likely reasons (best guess)</summary>
                  <ul>
                    {selectedInsight.contributing_factors.map((factor) => (
                      <li key={factor.key}>
                        {factorLabel(factor.key)}: {factor.level}
                      </li>
                    ))}
                  </ul>
                </details>

                <details className="health-detail-root" open>
                  <summary>✅ Quick checks</summary>
                  <ul className="action-list">
                    {(selectedInsight.action_checklist || []).slice(0, 4).map((action) => {
                      const checkKey = `${selectedInsight.cow_id}-${action}`;
                      return (
                        <li key={checkKey}>
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(checked[checkKey])}
                              onChange={(e) => setChecked((prev) => ({ ...prev, [checkKey]: e.target.checked }))}
                            />
                            <span>{action}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </details>

                <details className="health-detail-root">
                  <summary>Details (numbers)</summary>
                  <table className="signal-table">
                    <thead>
                      <tr>
                        <th>Signal</th>
                        <th>Today</th>
                        <th>Baseline</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_ROWS.map(([key, label]) => {
                        const today = selectedSignal[key];
                        const base = selectedBaseline[key];
                        const delta = deltaPct(today, base);
                        return (
                          <tr key={`${selectedInsight.cow_id}-${key}`}>
                            <td>{label}</td>
                            <td>{fmt(today)}</td>
                            <td>{fmt(base)}</td>
                            <td className={delta == null ? '' : delta > 0 ? 'up' : 'down'}>
                              {delta == null ? 'N/A' : `${delta > 0 ? '+' : ''}${Math.round(delta)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </aside>
        </div>

          {!filteredInsights.length && <p className="subtext">No cows match current filters.</p>}
      </section>

      <section className="panel">
        <h2>Detected ear tags today</h2>
        <div className="manual-tag-row">
          <input
            type="text"
            value={manualTag}
            onChange={(e) => setManualTag(e.target.value)}
            placeholder="Manual ear tag entry / confirmation"
          />
          <button type="button" className="btn-secondary" onClick={addManualTag}>Add</button>
        </div>

        <ul className="detections-list">
          {detectionsToday.map((entry) => (
            <li key={entry.id} className="detection-row">
              <span>{entry.detected_at}</span>
              <strong>{entry.ear_tag_id}</strong>
              <span>{entry.source}</span>
              {entry.matched_cow_id ? (
                <span className="match-ok">Matched: {entry.matched_name}</span>
              ) : (
                <span className="match-miss">Unknown tag - please confirm</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <ServiceTicketModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={(payload) => {
          onCreateServiceTicket(payload);
        }}
        settings={settings}
        lastSyncTime={lastSyncTime}
        presetIssueType={issuePreset}
      />
    </div>
  );
}
