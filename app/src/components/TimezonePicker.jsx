import React from 'react';
import { QUICK_ZONES, allZones, zoneLabel, zoneOffsetLabel, displayZoneName } from '../lib/timezones.js';

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
      <p className="hint" style={{ fontWeight: 600, margin: '8px 0 2px' }}>
        Show times in — commonly used time zones
      </p>
      <div className="chip-row" role="group" aria-label="Commonly used time zones">
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
      <label htmlFor="tz-select" className="hint" style={{ fontWeight: 600, margin: '8px 0 0' }}>
        Full time zone list
        <select
          id="tz-select"
          value={zone}
          onChange={(e) => onZone(e.target.value)}
          style={{ fontWeight: 400 }}
        >
          {!zones.includes(zone) && <option value={zone}>{displayZoneName(zone)}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {displayZoneName(z)}
            </option>
          ))}
        </select>
      </label>
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
