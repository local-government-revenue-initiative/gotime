import React, { useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { levelColor } from '../lib/levelColors.js';
import { scoreSlots, maxScore } from '../lib/aggregate.js';

/**
 * Whole-day availability, for events with day granularity (e.g. planning
 * which week to visit a city). A month calendar where only the organizer's
 * candidate dates are selectable; respondents tap a day or drag across
 * several to mark a range with the chosen preference level.
 *
 * Mirrors AvailabilityGrid's two modes and the pointer-drag technique from
 * DateMultiPicker:
 *  - mode="edit":    availability {dayKey -> level}, onPaint(key, level), brush
 *  - mode="heatmap": responses[], selectedKey, onSelectSlot
 */
export default function DayAvailability({
  mode,
  grid,
  levels,
  availability,
  onPaint,
  brush,
  setBrush,
  responses,
  selectedKey,
  onSelectSlot,
  dateMeta = {},
}) {
  const candidates = useMemo(() => new Set(grid.columns.map((c) => c.date)), [grid]);
  const firstDate = grid.columns[0]?.date;
  const [viewMonth, setViewMonth] = useState(() =>
    (firstDate ? DateTime.fromISO(firstDate) : DateTime.now()).startOf('month'),
  );
  const gridRef = useRef(null);
  const dragRef = useRef(null);

  const nLevels = levels?.length || 3;
  const scored = useMemo(
    () => (mode === 'heatmap' ? scoreSlots(grid.allKeys, responses || []) : null),
    [mode, grid, responses],
  );
  const topScore = scored ? Math.max(1, maxScore(scored)) : 1;

  // Months that contain candidate dates, for the prev/next bounds.
  const monthsWithDates = useMemo(() => {
    const set = new Set(grid.columns.map((c) => DateTime.fromISO(c.date).toFormat('yyyy-MM')));
    return [...set].sort();
  }, [grid]);
  const monthKey = viewMonth.toFormat('yyyy-MM');
  const monthIndex = monthsWithDates.indexOf(monthKey);

  const monthStart = viewMonth.startOf('month');
  const gridStart = monthStart.minus({ days: (monthStart.weekday + 6) % 7 });
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(gridStart.plus({ days: i }));
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function paintDate(iso) {
    const drag = dragRef.current;
    if (!drag || drag.touched.has(iso)) return;
    drag.touched.add(iso);
    onPaint(iso, brush);
  }

  function onPointerDown(e) {
    if (mode !== 'edit') return;
    const cell = e.target.closest('[data-date]');
    if (!cell || cell.disabled) return;
    dragRef.current = { touched: new Set() };
    paintDate(cell.dataset.date);
    try {
      gridRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cell = target && target.closest('[data-date]');
    if (cell && !cell.disabled && gridRef.current?.contains(cell)) paintDate(cell.dataset.date);
  }

  function stopDrag() {
    dragRef.current = null;
  }

  function goMonth(delta) {
    const next = monthsWithDates[monthIndex + delta];
    if (next) setViewMonth(DateTime.fromISO(`${next}-01`));
    else setViewMonth(viewMonth.plus({ months: delta }));
  }

  return (
    <div>
      {mode === 'edit' && (
        <div className="brush-bar" role="toolbar" aria-label="Choose what to mark">
          {levels.map((label, i) => {
            const c = levelColor(i, nLevels);
            return (
              <button
                key={i}
                type="button"
                className={'brush' + (c.striped ? ' striped' : '')}
                style={{ backgroundColor: c.bg, color: c.ink }}
                aria-pressed={brush === i}
                onClick={() => setBrush(i)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="cal cal-wide">
        <div className="cal-nav">
          <button
            type="button"
            className="btn btn-small"
            aria-label="Previous month"
            disabled={monthIndex <= 0}
            onClick={() => goMonth(-1)}
          >
            ‹
          </button>
          <span className="cal-title">{viewMonth.toFormat('LLLL yyyy')}</span>
          <button
            type="button"
            className="btn btn-small"
            aria-label="Next month"
            disabled={monthIndex >= monthsWithDates.length - 1}
            onClick={() => goMonth(1)}
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
            const isCandidate = candidates.has(iso);
            const meta = dateMeta[iso] || {};
            const cls = ['cal-day', 'cal-day-lg'];
            if (!inMonth) cls.push('other-month');
            if (!isCandidate) cls.push('not-candidate');
            if (meta.suggested && !meta.approved) cls.push('pending');

            if (!isCandidate) {
              return (
                <button key={iso} type="button" disabled className={cls.join(' ')}>
                  {d.day}
                </button>
              );
            }

            if (mode === 'edit') {
              const v = Number(availability?.[iso]) || 0;
              const c = levelColor(v, nLevels);
              return (
                <button
                  key={iso}
                  type="button"
                  data-date={iso}
                  className={cls.join(' ') + (c.striped ? ' striped' : '')}
                  style={{ backgroundColor: c.bg, color: c.ink }}
                  aria-label={`${d.toFormat('cccc d LLLL')}: ${levels[v]}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPaint(iso, brush);
                    }
                  }}
                >
                  {d.day}
                </button>
              );
            }

            const s = scored.get(iso) || { score: 0, available: 0 };
            const frac = s.score / topScore;
            return (
              <button
                key={iso}
                type="button"
                data-date={iso}
                className={cls.join(' ') + (selectedKey === iso ? ' selected' : '')}
                style={
                  s.score > 0
                    ? {
                        backgroundColor: `rgba(71, 191, 175, ${0.15 + 0.85 * frac})`,
                        color: frac > 0.6 ? '#fff' : undefined,
                      }
                    : undefined
                }
                title={`${d.toFormat('cccc d LLLL')} — ${s.available} available`}
                aria-label={`${d.toFormat('cccc d LLLL')}: score ${s.score}, ${s.available} available`}
                onClick={() => onSelectSlot?.(iso)}
              >
                <span className="cal-day-num">{d.day}</span>
                {s.score > 0 && <span className="cal-day-score">{s.score}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="hint">
        {mode === 'edit'
          ? 'Only the dates the organizer proposed can be marked. Drag across days to mark a whole week at once.'
          : 'Darker shading = works for more people. Tap a day for the breakdown.'}
      </p>
    </div>
  );
}
