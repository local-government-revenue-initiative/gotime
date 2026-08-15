import React, { useRef, useState } from 'react';
import { DateTime } from 'luxon';

/**
 * Inline month calendar for choosing multiple dates: click a day to add or
 * remove it (the calendar stays open), or press and drag across several
 * days. Uses the same pointer technique as the availability grid so touch
 * devices work too. Past dates are disabled.
 *
 * value: sorted array of "yyyy-MM-dd" strings; onChange(next).
 */
export default function DateMultiPicker({ value, onChange }) {
  const today = DateTime.now().startOf('day');
  const [viewMonth, setViewMonth] = useState(
    () => (value.length ? DateTime.fromISO(value[0]) : today).startOf('month'),
  );
  const gridRef = useRef(null);
  const dragRef = useRef(null); // { mode: 'add' | 'remove', touched: Set }

  const monthStart = viewMonth.startOf('month');
  // Monday-first grid, padded to full weeks.
  const gridStart = monthStart.minus({ days: (monthStart.weekday + 6) % 7 });
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(gridStart.plus({ days: i }));
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function applyTo(iso) {
    const drag = dragRef.current;
    if (!drag || drag.touched.has(iso)) return;
    drag.touched.add(iso);
    if (drag.mode === 'add') {
      if (!value.includes(iso)) {
        value = [...value, iso].sort();
        onChange(value);
      }
    } else if (value.includes(iso)) {
      value = value.filter((d) => d !== iso);
      onChange(value);
    }
  }

  function cellFromPoint(x, y) {
    const target = document.elementFromPoint(x, y);
    const cell = target && target.closest('[data-date]');
    return cell && gridRef.current?.contains(cell) ? cell : null;
  }

  function onPointerDown(e) {
    const cell = e.target.closest('[data-date]');
    if (!cell || cell.disabled) return;
    const iso = cell.dataset.date;
    dragRef.current = { mode: value.includes(iso) ? 'remove' : 'add', touched: new Set() };
    applyTo(iso);
    try {
      gridRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell && !cell.disabled) applyTo(cell.dataset.date);
  }

  function stopDrag() {
    dragRef.current = null;
  }

  return (
    <div className="cal" aria-label="Choose dates">
      <div className="cal-nav">
        <button
          type="button"
          className="btn btn-small"
          aria-label="Previous month"
          disabled={monthStart <= today.startOf('month')}
          onClick={() => setViewMonth(viewMonth.minus({ months: 1 }))}
        >
          ‹
        </button>
        <span className="cal-title">{viewMonth.toFormat('LLLL yyyy')}</span>
        <button
          type="button"
          className="btn btn-small"
          aria-label="Next month"
          onClick={() => setViewMonth(viewMonth.plus({ months: 1 }))}
        >
          ›
        </button>
      </div>
      <div
        className="cal-grid"
        ref={gridRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {weekdays.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const iso = d.toISODate();
          const inMonth = d.month === viewMonth.month;
          const disabled = d < today;
          const selected = value.includes(iso);
          return (
            <button
              key={iso}
              type="button"
              data-date={iso}
              disabled={disabled}
              className={
                'cal-day' +
                (selected ? ' selected' : '') +
                (inMonth ? '' : ' other-month') +
                (d.hasSame(today, 'day') ? ' today' : '')
              }
              aria-pressed={selected}
              aria-label={d.toFormat('cccc d LLLL yyyy')}
            >
              {d.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
