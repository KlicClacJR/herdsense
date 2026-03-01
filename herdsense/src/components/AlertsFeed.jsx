import { useMemo, useState } from 'react';
import { ALERT_SCORE_BANDS, TIER2_FEED_TYPES } from '../data/constants';

const FILTERS = ['All', 'Urgent', 'Alert', 'Watch', 'Stable'];
const URGENCY_SCORE = { urgent: 3, alert: 2, watch: 1, info: 0 };
const FEED_LABELS = {
  hay: 'Hay $/kg',
  silage: 'Silage $/kg',
  grain: 'Grain $/kg',
  mineralMix: 'Mineral $/kg',
};

function sparklinePath(values, width = 140, height = 36) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / spread) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function barTone(score) {
  if (score < ALERT_SCORE_BANDS.greenMax) return 'green';
  if (score <= ALERT_SCORE_BANDS.yellowMax) return 'yellow';
  return 'red';
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function Sparkline({ values, label }) {
  const path = sparklinePath(values);
  return (
    <div className="metric-sparkline">
      <span>{label}</span>
      <svg width="150" height="38" viewBox="0 0 140 36" role="img" aria-label={label}>
        <path d={path} fill="none" stroke="#2D6A4F" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function AlertsFeed({ alertEngine, animals }) {
  const [filter, setFilter] = useState('All');
  const cards = alertEngine?.cowCards || [];
  const feedCosts = alertEngine?.farmSettings?.feed_costs || {};
  const lastSimulation = alertEngine?.lastSimulation;

  const filteredCards = useMemo(() => {
    if (filter === 'All') return cards;
    if (filter === 'Stable') {
      return cards.filter((card) => (URGENCY_SCORE[card.topConditions?.[0]?.severity] || 0) === 0);
    }
    const min = filter === 'Urgent' ? 3 : filter === 'Alert' ? 2 : 1;
    return cards.filter((card) => (URGENCY_SCORE[card.topConditions?.[0]?.severity] || 0) >= min);
  }, [cards, filter]);

  return (
    <div className="screen alerts-screen">
      <header className="screen-header">
        <h1>Herd Health + Optimization AI</h1>
      </header>

      <section className="alert-toolbar">
        <button
          type="button"
          className="btn-primary"
          onClick={() => alertEngine?.simulateDay?.()}
          disabled={!cards.length}
        >
          Simulate Day (Anomaly)
        </button>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(alertEngine?.farmSettings?.is_mating_season)}
            onChange={(e) => alertEngine?.setMatingSeason?.(e.target.checked)}
          />
          <span>Mating season active</span>
        </label>
      </section>

      <section className="feed-cost-grid">
        {TIER2_FEED_TYPES.map((type) => (
          <label key={type} className="feed-cost-field">
            <span>{FEED_LABELS[type]}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={feedCosts[type] ?? 0}
              onChange={(e) => alertEngine?.updateFeedCost?.(type, e.target.value)}
            />
          </label>
        ))}
      </section>

      {lastSimulation && (
        <p className="simulation-note">
          Last simulation: {lastSimulation.conditionKey} for {lastSimulation.cowId} at{' '}
          {new Date(lastSimulation.at).toLocaleTimeString()}.
        </p>
      )}

      <div className="filter-chips-row">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`filter-chip ${filter === item ? 'active' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {alertEngine?.herdOptimization?.cows?.length > 0 && (
        <div className="herd-optimization-card">
          <strong>Herd-level optimization:</strong> Reduce ration by 5% for{' '}
          {alertEngine.herdOptimization.cows.join(', ')}. Estimated weekly savings:{' '}
          {formatCurrency(alertEngine.herdOptimization.estimatedWeeklySavings)}.
        </div>
      )}

      <div className="alerts-list">
        {!filteredCards.length && (
          <div className="alert-card">
            <p className="alert-message">No cow profiles match this filter.</p>
            <p className="alert-action">
              <em>{animals?.length ? 'Add more cows or run a simulation to generate alerts.' : 'No animals available.'}</em>
            </p>
          </div>
        )}

        {filteredCards.map((card) => {
          const primary = card.topConditions?.[0];
          const primaryScore = primary?.score ?? 0;
          return (
            <article key={card.cowId} className="ai-cow-card">
              <div className="ai-cow-header">
                <div>
                  <h2>
                    {card.emoji} {card.cowName} ({card.cowId})
                  </h2>
                  <p>{card.profileSummary}</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => alertEngine?.simulateDay?.(card.cowId)}
                >
                  Simulate this cow
                </button>
              </div>

              <p className="ai-cow-summary">{card.summary}</p>

              <section className="condition-section">
                <h3>Top 3 conditions</h3>
                {card.topConditions.map((condition) => (
                  <div key={condition.key} className="condition-row">
                    <div className="condition-row-head">
                      <span>{condition.label}</span>
                      <strong>{Math.round(condition.score)}%</strong>
                    </div>
                    <div className="condition-track">
                      <div
                        className={`condition-fill ${barTone(condition.score)}`}
                        style={{ width: `${Math.round(condition.score)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </section>

              <section className="actions-section">
                <h3>What to do next</h3>
                {card.actions.map((action) => (
                  <div key={action.id} className={`action-card ${action.severity}`}>
                    <div className="action-title-row">
                      <strong>{action.title}</strong>
                      <span>{action.severity.toUpperCase()}</span>
                    </div>
                    <p>{action.text}</p>
                  </div>
                ))}
              </section>

              <section className="trends-section">
                <h3>Trend sparklines (14 days)</h3>
                <div className="sparkline-grid">
                  <Sparkline values={card.trends.distance} label="Distance (km)" />
                  <Sparkline values={card.trends.troughVisits} label="Trough visits" />
                  <Sparkline values={card.trends.lyingTime} label="Lying time (min)" />
                  <Sparkline values={card.trends.shadeTime} label="Shade time (min)" />
                </div>
              </section>

              <section className="prompts-section">
                <h3>Prompt to check</h3>
                <ul>
                  {card.prompts.map((prompt) => (
                    <li key={prompt}>{prompt}</li>
                  ))}
                </ul>
              </section>

              <section className="tier2-section">
                <h3>Tier 2: Feed optimization</h3>
                <p>
                  Feed Efficiency Score: <strong>{card.tier2.feedEfficiencyScore}</strong>
                </p>
                <p>
                  Cost per liter (dairy):{' '}
                  <strong>{card.tier2.costPerLiter === null ? 'N/A' : formatCurrency(card.tier2.costPerLiter)}</strong>
                </p>
                <p>
                  Ration Target: <strong>{card.tier2.rationText}</strong>
                </p>
                {card.tier2.wasteDetected && (
                  <p className="tier2-flag">Waste detection: trough engagement is low for expected ration size.</p>
                )}
                {card.tier2.underperformer && (
                  <p className="tier2-flag">
                    Underperformer flag: consuming more feed than herd average with weaker output trend.
                  </p>
                )}
                <div className="weekly-grid">
                  {card.tier2.weekly.map((week, idx) => (
                    <div key={`${card.cowId}-week-${idx}`} className="weekly-cell">
                      <span>W{idx + 1}</span>
                      <small>Efficiency {week.feedEfficiency}%</small>
                      <small>Weight {week.weightTrend}kg</small>
                      <small>Cost/unit {week.costPerUnit === null ? 'N/A' : `$${week.costPerUnit}`}</small>
                    </div>
                  ))}
                </div>
              </section>

              <footer className="ai-cow-footer">
                <span>
                  Primary risk: {primary?.label || 'None'} ({Math.round(primaryScore)}%)
                </span>
                <span>THI: {card.thi.toFixed(1)}</span>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
