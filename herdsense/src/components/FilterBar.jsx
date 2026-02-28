import { SPECIES } from '../data/constants';

const SPECIES_OPTIONS = ['All', ...SPECIES];
const SEX_OPTIONS = ['All', 'Male', 'Female'];
const STATUS_OPTIONS = ['All', 'Urgent', 'At Risk', 'Monitor', 'Healthy'];
const PREGNANCY_OPTIONS = ['All', 'Pregnant', 'Not Pregnant'];

export default function FilterBar({ filters, setFilters }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Species</span>
        <div className="filter-chips">
          {SPECIES_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`filter-chip ${filters.species === opt ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, species: opt }))}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Sex</span>
        <div className="filter-chips">
          {SEX_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`filter-chip ${filters.sex === opt ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, sex: opt }))}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Status</span>
        <div className="filter-chips">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`filter-chip ${filters.status === opt ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, status: opt }))}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Pregnancy</span>
        <div className="filter-chips">
          {PREGNANCY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`filter-chip ${filters.pregnancy === opt ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, pregnancy: opt }))}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
