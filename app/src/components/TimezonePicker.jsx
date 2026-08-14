import React from 'react';
import { QUICK_ZONES, allZones, zoneLabel, zoneOffsetLabel } from '../lib/timezones.js';

/**
 * Primary display zone (quick chips + full IANA list) and, optionally, up to
 * two extra zones shown side-by-side on the grid's time axis.
 */
export default function TimezonePicker({ zone, onZone, extras = [], onExtras, allowExtras = false }) {
  const zones = allZones();

  function toggleExtra(z) {
    if (extras.includes(z)) onExtras(extras.filter((x) => x !== z));
    else if (extras.length < 2) onExtras([...extras, z]);
  }

  return (
    <div>
      <label htmlFor="tz-select">
        Show times in
        <select id="tz-select" value={zone} onChange={(e) => onZone(e.target.value)}>
          {!zones.includes(zone) && <option value={zone}>{zone}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <div className="chip-row" role="group" aria-label="Common time zones">
        {QUICK_ZONES.map((q) => (
          <button
            key={q.zone}
            type="button"
            className="chip"
            aria-pressed={zone === q.zone}
            title={zoneOffsetLabel(q.zone)}
            onClick={() => onZone(q.zone)}
          >
            {q.label}
          </button>
        ))}
      </div>
      {allowExtras && (
        <details className="section" style={{ boxShadow: 'none' }}>
          <summary>
            Compare time zones
            <span className="sub">
              {extras.length ? extras.map(zoneLabel).join(', ') + ' shown alongside' : 'show a second clock next to the times'}
            </span>
          </summary>
          <div className="section-body">
            <p className="hint">Pick up to two extra zones to display side-by-side on the grid.</p>
            <div className="chip-row">
              {QUICK_ZONES.filter((q) => q.zone !== zone).map((q) => (
                <button
                  key={q.zone}
                  type="button"
                  className="chip"
                  aria-pressed={extras.includes(q.zone)}
                  onClick={() => toggleExtra(q.zone)}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
