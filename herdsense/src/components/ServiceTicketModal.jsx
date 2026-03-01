import { useEffect, useMemo, useState } from 'react';

const ISSUE_TYPES = [
  'Camera not detecting cows',
  'Camera damaged',
  'Camera obstructed (dust/mud/fly droppings)',
  'Feeding station moved',
  'Water sensor issue',
  'App showing incorrect data',
  'Other',
];

function nowText() {
  return new Date().toLocaleString();
}

export default function ServiceTicketModal({
  open,
  onClose,
  onSubmit,
  settings,
  lastSyncTime,
  presetIssueType = '',
}) {
  const [issueType, setIssueType] = useState(presetIssueType || ISSUE_TYPES[0]);
  const [description, setDescription] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIssueType(presetIssueType || ISSUE_TYPES[0]);
    setDescription('');
    setPhotoName('');
    setConfirmed(false);
  }, [open, presetIssueType]);

  const createdAt = useMemo(() => nowText(), [open]);

  if (!open) return null;

  const submit = () => {
    if (!issueType) return;
    onSubmit({
      issue_type: issueType,
      description,
      photo_name: photoName || null,
    });
    setConfirmed(true);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="header-actions">
          <h3>🛠️ Report Issue</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>

        {!confirmed ? (
          <>
            <div className="form-grid">
              <label>
                Farm
                <input type="text" value={settings?.farm_name || 'Demo Farm'} disabled />
              </label>
              <label>
                Station
                <input type="text" value={settings?.station_id || settings?.feeding_station_label || 'station-1'} disabled />
              </label>
              <label>
                Timestamp
                <input type="text" value={createdAt} disabled />
              </label>
              <label className="full-width">
                Last sync
                <input type="text" value={lastSyncTime || 'Not available'} disabled />
              </label>
              <label className="full-width">
                Issue type
                <select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
                  {ISSUE_TYPES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Description
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened?"
                />
              </label>
              <label className="full-width">
                Optional photo
                <input
                  type="file"
                  onChange={(e) => setPhotoName(e.target.files?.[0]?.name || '')}
                />
              </label>
            </div>
            <button type="button" className="btn-primary" onClick={submit}>Submit Report</button>
          </>
        ) : (
          <p className="warning-text">Reported - a KVK worker will review this.</p>
        )}
      </div>
    </div>
  );
}
