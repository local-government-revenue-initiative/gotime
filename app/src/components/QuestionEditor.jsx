import React from 'react';

/**
 * Editor for organizer-defined poll questions.
 * value: [{ type: 'single'|'multi'|'text', label, optionsText, required }]
 *
 * optionsText is the raw textarea content, kept verbatim while typing —
 * parsing it into an options array happens only when the form is saved
 * (parseOptionsText). Normalizing on every keystroke made it impossible to
 * type spaces or press Enter.
 */
export function parseOptionsText(text) {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}
export default function QuestionEditor({ value, onChange }) {
  function update(i, patch) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      {value.length === 0 && (
        <p className="hint">
          No extra questions yet. Add one to ask respondents anything beyond their availability —
          for example “Will you join in person or online?”
        </p>
      )}
      {value.map((q, i) => (
        <div className="q-row" key={i}>
          <div className="q-head">
            <label className="grow">
              Question
              <input
                type="text"
                value={q.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="e.g. Will you join in person or online?"
              />
            </label>
            <label>
              Type
              <select
                value={q.type}
                onChange={(e) => update(i, { type: e.target.value })}
              >
                <option value="single">Choose one</option>
                <option value="multi">Choose several</option>
                <option value="text">Free text</option>
              </select>
            </label>
          </div>
          {q.type !== 'text' && (
            <label>
              Options (one per line)
              <textarea
                rows={3}
                value={q.optionsText ?? ''}
                onChange={(e) => update(i, { optionsText: e.target.value })}
                placeholder={'In person\nOnline'}
              />
            </label>
          )}
          <div className="checkbox">
            <input
              id={`q-req-${i}`}
              type="checkbox"
              checked={Boolean(q.required)}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
            <label htmlFor={`q-req-${i}`} style={{ margin: 0, fontWeight: 400 }}>
              Required
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-small" onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => move(i, 1)}
              disabled={i === value.length - 1}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange([...value, { type: 'single', label: '', optionsText: '', required: false }])}
      >
        + Add a question
      </button>
    </div>
  );
}
