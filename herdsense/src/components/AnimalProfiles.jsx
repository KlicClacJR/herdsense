import { useState } from 'react';
import { Plus, X, ChevronRight, Syringe } from 'lucide-react';
import { SPECIES, SPECIES_EMOJI, PREGNANCY_OPTIONS, CASTRATION_OPTIONS, STATUS } from '../data/constants';
import FilterBar from './FilterBar';

const emptyAnimal = {
  name: '',
  species: 'Cow',
  age: '',
  sex: 'Female',
  weight: '',
  purchasePrice: '',
  pregnancyStatus: 'Not Pregnant',
  healthConditions: '',
  vaccinationRecords: [],
  gpsTagId: '',
  purchaseYear: '',
  firstYearOnFarm: '',
  castrationStatus: 'N/A',
  photoBase64: '',
  notes: '',
  status: 'healthy',
};

export default function AnimalProfiles({ animals, addAnimal, updateAnimal, deleteAnimal }) {
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyAnimal);
  const [filters, setFilters] = useState({
    species: 'All',
    sex: 'All',
    status: 'All',
    pregnancy: 'All',
  });

  const filteredAnimals = animals.filter((a) => {
    if (filters.species !== 'All' && a.species !== filters.species) return false;
    if (filters.sex !== 'All' && a.sex !== filters.sex) return false;
    if (filters.status !== 'All' && a.status !== filters.status) return false;
    if (filters.pregnancy !== 'All') {
      if (filters.pregnancy === 'Pregnant' && a.pregnancyStatus !== 'Pregnant') return false;
      if (filters.pregnancy === 'Not Pregnant' && a.pregnancyStatus === 'Pregnant') return false;
    }
    return true;
  });

  const openNew = () => {
    setForm({ ...emptyAnimal });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (a) => {
    setForm({
      name: a.name,
      species: a.species || 'Cow',
      age: a.age ?? '',
      sex: a.sex || 'Female',
      weight: a.weight ?? '',
      purchasePrice: a.purchasePrice ?? '',
      pregnancyStatus: a.pregnancyStatus || 'Not Pregnant',
      healthConditions: a.healthConditions || '',
      vaccinationRecords: Array.isArray(a.vaccinationRecords) ? a.vaccinationRecords : [],
      gpsTagId: a.gpsTagId || '',
      purchaseYear: a.purchaseYear ?? '',
      firstYearOnFarm: a.firstYearOnFarm ?? '',
      castrationStatus: a.castrationStatus || 'N/A',
      photoBase64: a.photoBase64 || '',
      notes: a.notes || '',
      status: a.status || 'healthy',
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setForm((f) => ({ ...f, photoBase64: r.result }));
    r.readAsDataURL(file);
  };

  const addVaccination = () => {
    setForm((f) => ({
      ...f,
      vaccinationRecords: [
        ...f.vaccinationRecords,
        { vaccineName: '', dateAdministered: '', nextDueDate: '', administeredBy: '' },
      ],
    }));
  };

  const updateVaccination = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      vaccinationRecords: f.vaccinationRecords.map((v, i) =>
        i === idx ? { ...v, [field]: value } : v
      ),
    }));
  };

  const removeVaccination = (idx) => {
    setForm((f) => ({
      ...f,
      vaccinationRecords: f.vaccinationRecords.filter((_, i) => i !== idx),
    }));
  };

  const save = () => {
    const payload = {
      ...form,
      age: Number(form.age) || 0,
      weight: Number(form.weight) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      purchaseYear: Number(form.purchaseYear) || undefined,
      firstYearOnFarm: Number(form.firstYearOnFarm) || undefined,
      vaccinationRecords: (form.vaccinationRecords || []).filter(
        (v) => v.vaccineName || v.dateAdministered || v.administeredBy
      ),
    };
    if (editingId) {
      updateAnimal(editingId, payload);
    } else {
      const id = (payload.name || 'Animal').toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      addAnimal({ ...payload, id });
    }
    setShowForm(false);
    setForm(emptyAnimal);
    setEditingId(null);
  };

  return (
    <div className="screen animals-screen">
      <header className="screen-header">
        <h1>Animal Profiles</h1>
        <button type="button" className="btn-primary btn-add" onClick={openNew}>
          <Plus size={20} /> Add Animal
        </button>
      </header>

      <FilterBar filters={filters} setFilters={setFilters} />
      <p className="filter-count">Showing {filteredAnimals.length} of {animals.length} animals</p>

      <ul className="animal-list">
        {filteredAnimals.map((a) => {
          const emoji = SPECIES_EMOJI[a.species] || '🐄';
          const status = STATUS[a.status] || STATUS.healthy;
          return (
            <li key={a.id} className="animal-list-item">
              <button type="button" className="animal-list-btn" onClick={() => openEdit(a)}>
                <span className="animal-list-emoji">{emoji}</span>
                <div className="animal-list-info">
                  <span className="animal-list-name">{a.name}</span>
                  <span className="animal-list-meta">{a.species} • {a.age}yr • {a.sex}</span>
                  <span className="animal-list-status" style={{ background: status.color }}>
                    {status.label}
                  </span>
                </div>
                <ChevronRight size={20} />
              </button>
            </li>
          );
        })}
      </ul>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content animal-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Animal' : 'Add Animal'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowForm(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body form-scroll">
              <div className="form-group">
                <label>Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Animal name"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Species</label>
                  <select
                    value={form.species}
                    onChange={(e) => setForm((f) => ({ ...f, species: e.target.value }))}
                  >
                    {SPECIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Age (years)</label>
                  <input
                    type="number"
                    value={form.age}
                    onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Sex</label>
                  <select
                    value={form.sex}
                    onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Weight (kg)</label>
                  <input
                    type="number"
                    value={form.weight}
                    onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Purchase Price (USD)</label>
                  <input
                    type="number"
                    value={form.purchasePrice}
                    onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <label>Purchase Year</label>
                  <input
                    type="number"
                    value={form.purchaseYear}
                    onChange={(e) => setForm((f) => ({ ...f, purchaseYear: e.target.value }))}
                    placeholder="e.g. 2022"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>First Year on Farm</label>
                <input
                  type="number"
                  value={form.firstYearOnFarm}
                  onChange={(e) => setForm((f) => ({ ...f, firstYearOnFarm: e.target.value }))}
                  placeholder="e.g. 2022"
                />
              </div>
              <div className="form-group">
                <label>Pregnancy Status</label>
                <select
                  value={form.pregnancyStatus}
                  onChange={(e) => setForm((f) => ({ ...f, pregnancyStatus: e.target.value }))}
                >
                  {PREGNANCY_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Castration Status</label>
                <select
                  value={form.castrationStatus}
                  onChange={(e) => setForm((f) => ({ ...f, castrationStatus: e.target.value }))}
                >
                  {CASTRATION_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>GPS Tag ID</label>
                <input
                  value={form.gpsTagId}
                  onChange={(e) => setForm((f) => ({ ...f, gpsTagId: e.target.value }))}
                  placeholder="e.g. TAG-001"
                />
              </div>
              <div className="form-group">
                <label>Known Health Conditions</label>
                <input
                  value={form.healthConditions}
                  onChange={(e) => setForm((f) => ({ ...f, healthConditions: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label>Upload Photo</label>
                <input type="file" accept="image/*" onChange={handlePhoto} />
                {form.photoBase64 && (
                  <img src={form.photoBase64} alt="Preview" className="photo-preview" />
                )}
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any other notes..."
                  rows={3}
                />
              </div>

              <div className="form-section">
                <h3><Syringe size={18} /> Vaccination Records</h3>
                <div className="vaccination-timeline">
                {form.vaccinationRecords.map((v, idx) => (
                  <div key={idx} className="vaccination-entry">
                    <input
                      placeholder="Vaccine name"
                      value={v.vaccineName}
                      onChange={(e) => updateVaccination(idx, 'vaccineName', e.target.value)}
                    />
                    <input
                      type="date"
                      placeholder="Date administered"
                      value={v.dateAdministered}
                      onChange={(e) => updateVaccination(idx, 'dateAdministered', e.target.value)}
                    />
                    <input
                      type="date"
                      placeholder="Next due"
                      value={v.nextDueDate}
                      onChange={(e) => updateVaccination(idx, 'nextDueDate', e.target.value)}
                    />
                    <input
                      placeholder="Administered by (vet name)"
                      value={v.administeredBy}
                      onChange={(e) => updateVaccination(idx, 'administeredBy', e.target.value)}
                    />
                    <button type="button" className="btn-remove-small" onClick={() => removeVaccination(idx)}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
                </div>
                <button type="button" className="btn-secondary" onClick={addVaccination}>
                  + Add vaccination
                </button>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="healthy">Healthy</option>
                  <option value="monitor">Monitor</option>
                  <option value="atRisk">At Risk</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              {editingId && (
                <button type="button" className="btn-danger" onClick={() => { deleteAnimal(editingId); setShowForm(false); }}>
                  Delete
                </button>
              )}
              <div className="modal-footer-right">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={save}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
