import { useState, useMemo } from 'react';
import { ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';
import { STATUS, SPECIES_EMOJI } from '../data/constants';

const PERIODS = ['Daily', 'Weekly', 'Monthly'];

const CONCERN_ORDER = { urgent: 0, atRisk: 1, monitor: 2, healthy: 3 };

const MOCK_INSIGHTS = {
  stella: { trend: 'stable', insight: 'Stella maintains consistent grazing patterns; no intervention needed.', action: 'Continue routine checks.' },
  bart: { trend: 'declining', insight: "Bart's activity has dropped significantly this week — recommend vet check.", action: 'Schedule health check within 48 hours.' },
  maria: { trend: 'declining', insight: 'Maria shows slightly reduced movement; monitor for another day.', action: 'Recheck activity tomorrow.' },
  bruno: { trend: 'improving', insight: 'Bruno returned to normal after boundary alert; fence was repaired.', action: 'Verify perimeter regularly.' },
  luna: { trend: 'declining', insight: 'Luna may be in labor or distress; immediate attention required.', action: 'Check on Luna now and contact vet if needed.' },
};

function BarChart({ thisWeek, lastWeek }) {
  const max = Math.max(thisWeek, lastWeek, 1);
  return (
    <div className="report-bars">
      <div className="report-bar-group">
        <span className="report-bar-label">Last week</span>
        <div className="report-bar-track">
          <div className="report-bar-fill" style={{ width: `${(lastWeek / max) * 100}%` }} />
        </div>
        <span>{lastWeek}</span>
      </div>
      <div className="report-bar-group">
        <span className="report-bar-label">This week</span>
        <div className="report-bar-track">
          <div className="report-bar-fill primary" style={{ width: `${(thisWeek / max) * 100}%` }} />
        </div>
        <span>{thisWeek}</span>
      </div>
    </div>
  );
}

export default function Reports({ animals, movements }) {
  const [period, setPeriod] = useState('Weekly');

  const aiSummary = useMemo(() => {
    const urgent = animals.filter((a) => a.status === 'urgent').length;
    const atRisk = animals.filter((a) => a.status === 'atRisk').length;
    if (period === 'Daily') {
      return `Today's herd summary: ${animals.length} animals tracked. ${urgent ? `${urgent} animal(s) need immediate attention (Luna). ` : ''}${atRisk ? `${atRisk} animal(s) show reduced activity (Bart). ` : ''}Overall herd activity is within normal range for most animals. Check the Alerts feed for details.`;
    }
    if (period === 'Weekly') {
      return `This week: HerdSense tracked ${animals.length} animals. ${urgent ? 'One urgent alert (Luna — possible calving distress). ' : ''}${atRisk ? 'Bart showed 60% lower movement; recommend monitoring. ' : ''}Maria had slightly reduced activity. Stella and Bruno are healthy. One security event (Bruno left boundary) was resolved. Recommend vet visit for Luna and observation for Bart.`;
    }
    return `Monthly overview: All ${animals.length} animals have been monitored. Key events: Luna (pregnant) triggered urgent alert; Bart had low activity period; Bruno had a boundary breach. Vaccination and routine checks are up to date for most. Consider scheduling a herd health review.`;
  }, [animals, period]);

  const sortedAnimals = useMemo(() => {
    return [...animals].sort((a, b) => (CONCERN_ORDER[a.status] ?? 4) - (CONCERN_ORDER[b.status] ?? 4));
  }, [animals]);

  const activityScore = (animalId) => {
    const pts = movements[animalId] || [];
    if (pts.length < 2) return { thisWeek: 0, lastWeek: 0 };
    const now = Date.now();
    const weekMs = 7 * 86400000;
    const thisWeekStart = now - weekMs;
    const lastWeekStart = now - 2 * weekMs;
    let thisSteps = 0;
    let lastSteps = 0;
    pts.forEach((p, i) => {
      if (p.timestamp >= thisWeekStart) thisSteps += p.steps || 0;
      else if (p.timestamp >= lastWeekStart && p.timestamp < thisWeekStart) lastSteps += p.steps || 0;
    });
    return { thisWeek: Math.round(thisSteps / 10), lastWeek: Math.round(lastSteps / 10) };
  };

  return (
    <div className="screen reports-screen">
      <header className="screen-header">
        <h1>Reports</h1>
      </header>
      <div className="period-toggle">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <section className="ai-summary">
        <h2>AI Summary</h2>
        <p className="ai-summary-text">{aiSummary}</p>
      </section>
      <section className="animal-reports">
        <h2>Per-animal feedback</h2>
        {sortedAnimals.map((a) => {
          const emoji = SPECIES_EMOJI[a.species] || '🐄';
          const status = STATUS[a.status] || STATUS.healthy;
          const scores = activityScore(a.id);
          const mock = MOCK_INSIGHTS[a.id] || { trend: 'stable', insight: `${a.name} is doing well.`, action: 'Continue routine monitoring.' };
          const TrendIcon = mock.trend === 'improving' ? ArrowUp : mock.trend === 'declining' ? ArrowDown : ArrowRight;
          return (
            <div key={a.id} className="report-card" style={{ borderTopColor: status.color }}>
              <div className="report-card-header">
                <span className="report-emoji">{emoji}</span>
                <span className="report-name">{a.name}</span>
                <span className="report-trend" title={mock.trend}>
                  <TrendIcon size={18} />
                  {mock.trend}
                </span>
              </div>
              <BarChart thisWeek={scores.thisWeek} lastWeek={scores.lastWeek} />
              <p className="report-insight">{mock.insight}</p>
              <p className="report-action"><strong>Next:</strong> {mock.action}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}
