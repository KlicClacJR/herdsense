import { useState, useMemo } from 'react';
import { STATUS } from '../data/constants';

const FILTERS = ['All', 'Urgent', 'Security', 'At Risk', 'Monitor', 'Healthy'];

export default function AlertsFeed({ alerts, animals }) {
  const [filter, setFilter] = useState('All');

  const filterToType = { Urgent: 'urgent', Security: 'security', 'At Risk': 'atRisk', Monitor: 'monitor', Healthy: 'healthy' };
  const filtered = useMemo(() => {
    if (filter === 'All') return alerts;
    const type = filterToType[filter];
    return type ? alerts.filter((a) => a.type === type) : alerts;
  }, [alerts, filter]);

  const stripeColor = (type) => {
    if (type === 'security') return STATUS.security?.stripe || '#7B2CBF';
    return STATUS[type]?.stripe || '#2D6A4F';
  };

  return (
    <div className="screen alerts-screen">
      <header className="screen-header">
        <h1>Alerts Feed</h1>
      </header>
      <div className="filter-chips-row">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="alerts-list">
        {filtered.map((alert) => (
          <div
            key={alert.id}
            className="alert-card"
            style={{ borderLeftColor: stripeColor(alert.type) }}
          >
            <div className="alert-card-header">
              <span className="alert-emoji">{alert.emoji}</span>
              <span className="alert-animal-name">{alert.animalName}</span>
              <span className="alert-confidence">{alert.confidence}%</span>
            </div>
            <p className="alert-message">{alert.message}</p>
            <p className="alert-timeframe">Urgency: {alert.timeframe}</p>
            <p className="alert-action"><em>{alert.action}</em></p>
            <p className="alert-timestamp">
              {new Date(alert.timestamp).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
