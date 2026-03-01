import { useMemo, useState } from 'react';
import {
  COW_FEED_INPUT_MODES,
  LACTATION_STAGES,
  PRODUCTION_TYPES,
  SEX_OPTIONS,
  VACCINATION_OPTIONS,
} from '../data/constants';

const EMPTY_FORM = {
  cow_id: '',
  ear_tag_id: '',
  ear_tag_color: '',
  name: '',
  production_type: 'dairy',
  sex: 'female',
  date_of_birth: '',
  unknown_dob: false,
  age_years: '',
  lactation_stage: '',
  pregnancy_due_days: '',
  vaccination_status: [],
  notes: '',
  weight_kg: '',
  planned_cull_or_sale_date: '',
  target_milking_frequency: '',
  target_weight_or_goal: '',
  feed_intake_mode: 'inherit',
  manual_feed_kg_per_day: '',
  expected_sale_value: '',
};

function mapCowToForm(cow) {
  return {
    cow_id: cow.cow_id,
    ear_tag_id: cow.ear_tag_id || '',
    ear_tag_color: cow.ear_tag_color || '',
    name: cow.name || '',
    production_type: cow.production_type || 'dairy',
    sex: cow.sex || 'female',
    date_of_birth: cow.date_of_birth ? cow.date_of_birth.slice(0, 10) : '',
    unknown_dob: !cow.date_of_birth,
    age_years: cow.age_years ?? '',
    lactation_stage: cow.lactation_stage || '',
    pregnancy_due_days: cow.pregnancy_due_days ?? '',
    vaccination_status: cow.vaccination_status || [],
    notes: cow.notes || '',
    weight_kg: cow.weight_kg ?? '',
    planned_cull_or_sale_date: cow.planned_cull_or_sale_date ? cow.planned_cull_or_sale_date.slice(0, 10) : '',
    target_milking_frequency: cow.target_milking_frequency || '',
    target_weight_or_goal: cow.target_weight_or_goal || '',
    feed_intake_mode: cow.feed_intake_mode || 'inherit',
    manual_feed_kg_per_day: cow.manual_feed_kg_per_day ?? '',
    expected_sale_value: cow.expected_sale_value ?? '',
  };
}

export default function HerdManagerPage({
  activeCows,
  pastCows,
  onAddCow,
  onUpdateCow,
  onDeleteCow,
  onArchiveCow,
  onRestoreCow,
}) {
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const todayDate = new Date().toISOString().slice(0, 10);

  const list = showPast ? pastCows : activeCows;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((cow) => {
      const tag = `${cow.ear_tag_id || ''}`.toLowerCase();
      const name = `${cow.name || ''}`.toLowerCase();
      return tag.includes(q) || name.includes(q);
    });
  }, [list, query]);

  const startAdd = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setError('');
  };

  const startEdit = (cow) => {
    setEditingId(cow.cow_id);
    setForm(mapCowToForm(cow));
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const toggleVaccine = (name) => {
    setForm((prev) => {
      const exists = prev.vaccination_status.includes(name);
      return {
        ...prev,
        vaccination_status: exists
          ? prev.vaccination_status.filter((item) => item !== name)
          : [...prev.vaccination_status, name],
      };
    });
  };

  const submit = () => {
    setError('');

    if (!form.ear_tag_id.trim()) {
      setError('Ear tag is required.');
      return;
    }
    if (!form.unknown_dob && form.date_of_birth && form.date_of_birth > todayDate) {
      setError('Date of birth cannot be in the future.');
      return;
    }

    const payload = {
      ...form,
      ear_tag_id: form.ear_tag_id.trim().toUpperCase(),
      name: form.name.trim(),
      date_of_birth: form.unknown_dob ? null : (form.date_of_birth || null),
      age_years: form.unknown_dob ? form.age_years : null,
    };

    const result = editingId === 'new'
      ? onAddCow(payload)
      : onUpdateCow(editingId, payload);

    if (result && result.ok === false) {
      setError(result.error || 'Unable to save cow.');
      return;
    }

    cancelEdit();
  };

  const renderCowRow = (cow) => (
    <tr key={cow.cow_id}>
      <td>{cow.ear_tag_id}</td>
      <td>{cow.name || '—'}</td>
      <td>{cow.production_type}</td>
      <td>{cow.sex}</td>
      <td>{cow.date_of_birth ? cow.date_of_birth.slice(0, 10) : 'Unknown'}</td>
      <td>{cow.age_years ?? '—'}</td>
      <td>{cow.lactation_stage || '—'}</td>
      <td>{cow.pregnancy_due_days ?? '—'}</td>
      <td>{cow.is_active === false ? 'Inactive' : 'Active'}</td>
      <td className="actions-cell">
        {cow.is_active !== false ? (
          <>
            <button type="button" className="btn-secondary" onClick={() => startEdit(cow)}>Edit</button>
            <button type="button" className="btn-secondary" onClick={() => onArchiveCow(cow.cow_id)}>Archive</button>
          </>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => onRestoreCow(cow.cow_id)}>Restore</button>
        )}
        <button type="button" className="btn-danger" onClick={() => onDeleteCow(cow.cow_id)}>Delete</button>
      </td>
    </tr>
  );

  return (
    <div className="screen herd-manager-screen">
      <header className="screen-header">
        <div>
          <h1>Herd Manager</h1>
          <p className="subtext">Add, edit, archive, and remove cows. Ear tags are unique identity keys.</p>
        </div>
        <button type="button" className="btn-primary" onClick={startAdd}>Add cow</button>
      </header>

      <section className="panel">
        <div className="manager-toolbar">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ear tag or name"
          />
          <label className="switch-row">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
            />
            <span>{showPast ? 'Viewing past animals' : 'Viewing active herd'}</span>
          </label>
        </div>

        <div className="table-wrap">
          <table className="signal-table manager-table">
            <thead>
              <tr>
                <th>Ear tag</th>
                <th>Name</th>
                <th>Type</th>
                <th>Sex</th>
                <th>DOB</th>
                <th>Age</th>
                <th>Lactation</th>
                <th>Due days</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(renderCowRow)}
              {!filtered.length && (
                <tr>
                  <td colSpan={10}>No cows match this search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingId && (
        <section className="panel">
          <h2>{editingId === 'new' ? 'Add cow' : `Edit ${form.name || form.ear_tag_id}`}</h2>
          {error && <p className="error-text">{error}</p>}

          <div className="form-grid">
            <label>
              Ear tag ID *
              <input
                type="text"
                value={form.ear_tag_id}
                onChange={(e) => setForm((prev) => ({ ...prev, ear_tag_id: e.target.value }))}
              />
            </label>

            <label>
              Ear tag color
              <input
                type="text"
                value={form.ear_tag_color}
                onChange={(e) => setForm((prev) => ({ ...prev, ear_tag_color: e.target.value }))}
              />
            </label>

            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>

            <label>
              Production type
              <select
                value={form.production_type}
                onChange={(e) => setForm((prev) => ({ ...prev, production_type: e.target.value }))}
              >
                {PRODUCTION_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label>
              Sex
              <select
                value={form.sex}
                onChange={(e) => setForm((prev) => ({ ...prev, sex: e.target.value }))}
              >
                {SEX_OPTIONS.map((sex) => (
                  <option key={sex} value={sex}>{sex}</option>
                ))}
              </select>
            </label>

            <label>
              Date of birth
              <input
                type="date"
                max={todayDate}
                value={form.date_of_birth}
                disabled={form.unknown_dob}
                onChange={(e) => setForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
              />
            </label>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.unknown_dob}
                onChange={(e) => setForm((prev) => ({ ...prev, unknown_dob: e.target.checked }))}
              />
              <span>Unknown DOB</span>
            </label>

            <label>
              Approx age (years)
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={!form.unknown_dob}
                value={form.age_years}
                onChange={(e) => setForm((prev) => ({ ...prev, age_years: e.target.value }))}
              />
            </label>

            <label>
              Weight (kg)
              <input
                type="number"
                min="0"
                step="1"
                value={form.weight_kg}
                onChange={(e) => setForm((prev) => ({ ...prev, weight_kg: e.target.value }))}
              />
            </label>

            <label>
              Lactation stage
              <select
                value={form.lactation_stage}
                onChange={(e) => setForm((prev) => ({ ...prev, lactation_stage: e.target.value }))}
              >
                <option value="">—</option>
                {LACTATION_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </label>

            <label>
              Pregnancy due (days)
              <input
                type="number"
                min="0"
                value={form.pregnancy_due_days}
                onChange={(e) => setForm((prev) => ({ ...prev, pregnancy_due_days: e.target.value }))}
              />
            </label>

            <label>
              Planned cull/sale date
              <input
                type="date"
                value={form.planned_cull_or_sale_date}
                onChange={(e) => setForm((prev) => ({ ...prev, planned_cull_or_sale_date: e.target.value }))}
              />
            </label>

            <label>
              Feed intake mode
              <select
                value={form.feed_intake_mode}
                onChange={(e) => setForm((prev) => ({ ...prev, feed_intake_mode: e.target.value }))}
              >
                {COW_FEED_INPUT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </label>

            <label>
              Manual feed (kg/day)
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.manual_feed_kg_per_day}
                onChange={(e) => setForm((prev) => ({ ...prev, manual_feed_kg_per_day: e.target.value }))}
              />
            </label>

            <label>
              Expected sale value ($)
              <input
                type="number"
                min="0"
                step="1"
                value={form.expected_sale_value}
                onChange={(e) => setForm((prev) => ({ ...prev, expected_sale_value: e.target.value }))}
              />
            </label>

            <label>
              Target milking frequency
              <select
                value={form.target_milking_frequency}
                onChange={(e) => setForm((prev) => ({ ...prev, target_milking_frequency: e.target.value }))}
              >
                <option value="">—</option>
                <option value="1x/day">1x/day</option>
                <option value="2x/day">2x/day</option>
                <option value="3x/day">3x/day</option>
              </select>
            </label>

            <label>
              Target weight or goal
              <input
                type="text"
                value={form.target_weight_or_goal}
                onChange={(e) => setForm((prev) => ({ ...prev, target_weight_or_goal: e.target.value }))}
                placeholder="e.g. 620kg target"
              />
            </label>

            <label className="full-width">
              Vaccination status
              <div className="chips-wrap">
                {VACCINATION_OPTIONS.map((vac) => {
                  const active = form.vaccination_status.includes(vac);
                  return (
                    <button
                      key={vac}
                      type="button"
                      className={`chip ${active ? 'active' : ''}`}
                      onClick={() => toggleVaccine(vac)}
                    >
                      {vac}
                    </button>
                  );
                })}
              </div>
            </label>

            <label className="full-width">
              Notes
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>
          </div>

          <div className="header-actions">
            <button type="button" className="btn-primary" onClick={submit}>Save</button>
            <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}
