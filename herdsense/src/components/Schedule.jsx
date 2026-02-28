import { useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { SPECIES_EMOJI } from '../data/constants';
import { STATUS } from '../data/constants';

const TYPES = [
  { id: 'vaccination', label: 'Vaccination due', color: '#2D6A4F' },
  { id: 'vet', label: 'Vet visit', color: '#E76F51' },
  { id: 'reminder', label: 'Custom reminder', color: '#4361EE' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Schedule({ schedules, addSchedule, removeSchedule, updateSchedule, animals }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'reminder',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    animalId: '',
    notes: '',
  });

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const allEvents = useMemo(() => {
    const list = [...schedules];
    animals.forEach((a) => {
      (a.vaccinationRecords || []).forEach((v) => {
        if (v.nextDueDate) {
          list.push({
            id: `vacc-${a.id}-${v.vaccineName}-${v.nextDueDate}`,
            type: 'vaccination',
            title: `Vaccination: ${v.vaccineName || 'Due'}`,
            date: v.nextDueDate,
            animalId: a.id,
            notes: v.administeredBy ? `Last by ${v.administeredBy}` : '',
            fromRecord: true,
          });
        }
      });
    });
    return list;
  }, [schedules, animals]);

  const eventsByDay = useMemo(() => {
    const byDay = {};
    weekDays.forEach((d) => {
      const key = d.toISOString().slice(0, 10);
      byDay[key] = allEvents.filter((s) => (s.date && s.date.slice(0, 10) === key));
    });
    return byDay;
  }, [allEvents, weekDays]);

  const handleSubmit = (e) => {
    e.preventDefault();
    addSchedule({
      ...form,
      date: form.date,
      type: form.type,
      title: form.title || TYPES.find((t) => t.id === form.type)?.label,
      animalId: form.animalId || null,
      notes: form.notes,
    });
    setShowForm(false);
    setForm({ type: 'reminder', title: '', date: new Date().toISOString().slice(0, 10), animalId: '', notes: '' });
  };

  return (
    <div className="screen schedule-screen">
      <header className="screen-header">
        <h1>Schedule</h1>
        <button type="button" className="btn-primary btn-add" onClick={() => setShowForm(true)}>
          <Plus size={20} /> Add
        </button>
      </header>
      <div className="schedule-week">
        <div className="schedule-week-header">
          {weekDays.map((d) => (
            <div key={d.getTime()} className="schedule-day-header">
              <span className="day-name">{DAYS[d.getDay()]}</span>
              <span className="day-num">{d.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="schedule-week-grid">
          {weekDays.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const events = eventsByDay[key] || [];
            return (
              <div key={key} className="schedule-day-cell">
                {events.map((ev) => {
                  const typeConfig = TYPES.find((t) => t.id === ev.type) || TYPES[0];
                  const animal = ev.animalId ? animals.find((a) => a.id === ev.animalId) : null;
                  return (
                    <div
                      key={ev.id}
                      className="schedule-event"
                      style={{ borderLeftColor: typeConfig.color }}
                    >
                      <span className="schedule-event-title">{ev.title || typeConfig.label}</span>
                      {animal && (
                        <span className="schedule-event-animal">
                          {SPECIES_EMOJI[animal.species]} {animal.name}
                        </span>
                      )}
                      {!ev.fromRecord && (
                        <button
                          type="button"
                          className="schedule-event-remove"
                          onClick={() => removeSchedule(ev.id)}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="schedule-hint">Add vaccination due dates (from animal profiles), vet visits, and custom reminders.</p>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content schedule-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add event</h2>
              <button type="button" className="modal-close" onClick={() => setShowForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. FMD booster"
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Animal (optional)</label>
                <select
                  value={form.animalId}
                  onChange={(e) => setForm((f) => ({ ...f, animalId: e.target.value }))}
                >
                  <option value="">—</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.species})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
