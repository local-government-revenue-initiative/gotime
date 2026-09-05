import React from 'react';
import { WEEKDAY_SHORT, WEEKDAY_NAMES, normalizeWeekdays } from '../lib/slots.js';

/**
 * Seven toggle chips, Monday to Sunday, for choosing the days a recurring
 * meeting could fall on. value: ISO weekday numbers (1 = Monday); onChange
 * receives the sorted, de-duplicated list.
 */
export default function WeekdayPicker({ value, onChange, disabled = false }) {
  const selected = new Set(normalizeWeekdays(value));
  function toggle(n) {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange(normalizeWeekdays([...next]));
  }
  return (
    <div className="chip-row" role="group" aria-label="Days of the week">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <button
          key={n}
          type="button"
          className="chip"
          aria-pressed={selected.has(n)}
          aria-label={WEEKDAY_NAMES[n]}
          disabled={disabled}
          onClick={() => toggle(n)}
        >
          {WEEKDAY_SHORT[n]}
        </button>
      ))}
    </div>
  );
}
