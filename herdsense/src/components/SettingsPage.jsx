import { useState } from 'react';
import ServiceTicketModal from './ServiceTicketModal';
import { FEED_INPUT_MODES } from '../data/constants';

export default function SettingsPage({
  settings,
  baselineRecalibrationDaysLeft,
  onUpdateSetting,
  onSetDemoMode,
  serviceTickets = [],
  onCreateServiceTicket,
  onUpdateServiceTicketStatus,
  lastSyncTime,
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [showRequests, setShowRequests] = useState(false);

  return (
    <div className="screen settings-screen">
      <header className="screen-header">
        <div>
          <h1>Settings</h1>
          <p className="subtext">Farm profile, pricing defaults, and hardware labels.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setReportOpen(true)}>🛠️ Need Help? Report Issue</button>
      </header>

      <section className="panel">
        <h2>Farm profile</h2>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(settings.demo_mode)}
            onChange={(e) => onSetDemoMode?.(e.target.checked)}
          />
          <span>Demo Mode</span>
        </label>
        <div className="settings-row">
          <label>
            Farm name
            <input
              type="text"
              value={settings.farm_name || ''}
              onChange={(e) => onUpdateSetting('farm_name', e.target.value)}
            />
          </label>
          <label>
            Farm ID
            <input
              type="text"
              value={settings.farm_id || ''}
              onChange={(e) => onUpdateSetting('farm_id', e.target.value)}
            />
          </label>
          <label>
            Station ID
            <input
              type="text"
              value={settings.station_id || ''}
              onChange={(e) => onUpdateSetting('station_id', e.target.value)}
            />
          </label>
          <label>
            Timezone
            <input
              type="text"
              value={settings.timezone || ''}
              onChange={(e) => onUpdateSetting('timezone', e.target.value)}
              placeholder="America/New_York"
            />
          </label>
          <label>
            Feed cost per kg ($)
            <input
              type="number"
              step="0.01"
              value={settings.feed_cost_per_kg ?? ''}
              onChange={(e) => onUpdateSetting('feed_cost_per_kg', e.target.value)}
            />
          </label>
          <label>
            Milk price per liter ($)
            <input
              type="number"
              step="0.01"
              value={settings.milk_price_per_liter ?? ''}
              onChange={(e) => onUpdateSetting('milk_price_per_liter', e.target.value)}
            />
          </label>
          <label>
            Vet event cost estimate ($)
            <input
              type="number"
              step="1"
              value={settings.vet_visit_cost_estimate ?? ''}
              onChange={(e) => onUpdateSetting('vet_visit_cost_estimate', e.target.value)}
            />
          </label>
          <label>
            Dairy milk-loss/day estimate ($)
            <input
              type="number"
              step="1"
              value={settings.milk_loss_cost_per_day_estimate_dairy ?? ''}
              onChange={(e) => onUpdateSetting('milk_loss_cost_per_day_estimate_dairy', e.target.value)}
            />
          </label>
          <label>
            Beef loss/day estimate ($)
            <input
              type="number"
              step="1"
              value={settings.milk_loss_cost_per_day_estimate_beef ?? ''}
              onChange={(e) => onUpdateSetting('milk_loss_cost_per_day_estimate_beef', e.target.value)}
            />
          </label>
          <label>
            Impact days if escalation
            <input
              type="number"
              min="1"
              step="1"
              value={settings.days_of_impact_if_escalates ?? ''}
              onChange={(e) => onUpdateSetting('days_of_impact_if_escalates', e.target.value)}
            />
          </label>
          <label>
            Default feed intake source
            <select
              value={settings.default_feed_intake_mode || 'hybrid'}
              onChange={(e) => onUpdateSetting('default_feed_intake_mode', e.target.value)}
            >
              {FEED_INPUT_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label>
            kg per trough minute
            <input
              type="number"
              step="0.01"
              value={settings.kg_per_trough_minute ?? ''}
              onChange={(e) => onUpdateSetting('kg_per_trough_minute', e.target.value)}
            />
          </label>
          <label>
            kg per meal offset
            <input
              type="number"
              step="0.01"
              value={settings.kg_per_meal_offset ?? ''}
              onChange={(e) => onUpdateSetting('kg_per_meal_offset', e.target.value)}
            />
          </label>
          <label>
            Labor value per hour ($)
            <input
              type="number"
              step="1"
              value={settings.labor_value_per_hour ?? ''}
              onChange={(e) => onUpdateSetting('labor_value_per_hour', e.target.value)}
            />
          </label>
          <label>
            Labor constraint (hours/day)
            <input
              type="number"
              min="0"
              step="0.5"
              value={settings.labor_constraint_hours_day ?? ''}
              onChange={(e) => onUpdateSetting('labor_constraint_hours_day', e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Hardware labels</h2>
        <div className="settings-row">
          <label>
            Feeding station label
            <input
              type="text"
              value={settings.feeding_station_label || ''}
              onChange={(e) => onUpdateSetting('feeding_station_label', e.target.value)}
            />
          </label>
          <label>
            Water point label
            <input
              type="text"
              value={settings.water_point_label || ''}
              onChange={(e) => onUpdateSetting('water_point_label', e.target.value)}
            />
          </label>
          <label>
            Shade zone label
            <input
              type="text"
              value={settings.shade_zone_label || ''}
              onChange={(e) => onUpdateSetting('shade_zone_label', e.target.value)}
            />
          </label>
        </div>

        <p className="warning-text">
          Baselines may shift after moving the feeding station. We will rebuild baselines over
          the next 7-14 days and reduce alert confidence during this period.
        </p>
        {baselineRecalibrationDaysLeft > 0 && (
          <p className="warning-text">
            Baseline recalibration active: {baselineRecalibrationDaysLeft} simulated day(s) remaining.
          </p>
        )}
      </section>

      {settings.demo_mode && (
        <section className="panel">
          <div className="header-actions">
            <h2>Service Requests</h2>
            <label className="switch-row">
              <input type="checkbox" checked={showRequests} onChange={(e) => setShowRequests(e.target.checked)} />
              <span>{showRequests ? 'Hide list' : 'Show list'}</span>
            </label>
          </div>
          {showRequests && (
            <ul className="task-list">
              {serviceTickets.map((ticket) => (
                <li key={ticket.ticket_id}>
                  <div>
                    <strong>{ticket.issue_type}</strong>
                    <span>{ticket.station_id} • {ticket.created_at}</span>
                  </div>
                  <select
                    value={ticket.status}
                    onChange={(e) => onUpdateServiceTicketStatus(ticket.ticket_id, e.target.value)}
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </li>
              ))}
              {!serviceTickets.length && <li>No service issues reported.</li>}
            </ul>
          )}
        </section>
      )}

      <ServiceTicketModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={onCreateServiceTicket}
        settings={settings}
        lastSyncTime={lastSyncTime}
      />
    </div>
  );
}
