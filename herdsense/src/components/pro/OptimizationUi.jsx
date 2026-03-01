import { useState } from 'react';

function trendText(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
}

export function SectionHeader({ title, subtitle, actions = null }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="subtext">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function KpiCard({ title, value, trend, missingText, onAddData }) {
  return (
    <article className="kpi-card">
      <p className="kpi-title">{title}</p>
      <strong className="kpi-value">{value}</strong>
      <div className="kpi-foot">
        <span className={`kpi-trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}`}>vs last week: {trendText(trend)}</span>
        {missingText && (
          <button type="button" className="inline-link" onClick={onAddData}>
            {missingText}
          </button>
        )}
      </div>
    </article>
  );
}

export function ExpandableDetails({ label = 'Details', children }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="expandable" open={open} onToggle={(e) => setOpen(Boolean(e.currentTarget.open))}>
      <summary>{open ? 'Hide details' : `Show details${label ? `: ${label}` : ''}`}</summary>
      {children}
    </details>
  );
}

export function RecommendationCard({ leak }) {
  return (
    <article className="recommendation-card">
      <h3>{leak.title}</h3>
      <p className="rec-why">{leak.why}</p>
      <ul className="rec-actions">
        {(leak.do_next || [leak.action]).map((step) => <li key={`${leak.id}-${step}`}>{step}</li>)}
      </ul>
      <p className="rec-impact"><strong>Impact:</strong> {leak.impact_range || '—'}</p>
      <ExpandableDetails label="Recommendation details">
        <p><strong>Why this matters:</strong> {leak.evidence}</p>
      </ExpandableDetails>
    </article>
  );
}

export function CowCard({ card }) {
  return (
    <article className="recommendation-card cow-card">
      <h3>{card.name} ({card.ear_tag_id})</h3>
      <p><strong>Estimated cost/day:</strong> ${Number(card.estimated_cost_day || 0).toFixed(2)}</p>
      <p>
        <strong>Estimated revenue/day:</strong>{' '}
        {card.estimated_output_day == null ? 'Milk not entered' : `${card.estimated_output_day.toFixed(2)} L`}
      </p>
      <p><strong>Trend:</strong> {card.status}</p>
      <span className={`recommend-chip ${card.recommendation === 'Investigate' ? 'warn' : ''}`}>{card.recommendation}</span>
    </article>
  );
}
