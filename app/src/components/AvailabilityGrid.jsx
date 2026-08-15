import React, { useMemo, useRef, useLayoutEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { rowLabelsInZone, formatSlotInZone } from '../lib/slots.js';
import { zoneLabel } from '../lib/timezones.js';
import { levelColor } from '../lib/levelColors.js';
import { scoreSlots, maxScore } from '../lib/aggregate.js';

/**
 * The availability grid, in two modes (a direct port of the earlier
 * scheduler's buildGrid + brush painting + heatmap):
 *
 *  - mode="edit": tap/drag to paint cells with the selected brush level.
 *    Pointer moves are interpolated so fast drags don't skip cells.
 *    Props: availability {key->level}, onPaint(key, level), levels, brush,
 *    setBrush.
 *
 *  - mode="heatmap": combined view; cells show the summed score, shaded by
 *    fraction of the best slot. Props: responses, selectedKey, onSelectSlot.
 *
 * Shared props: grid (from buildSlotGrid), zones (1–3 display zones; extra
 * zones add label columns, Google-Calendar style), dateMeta {date ->
 * {suggested, approved}}.
 */
export default function AvailabilityGrid({
  mode,
  grid,
  zones,
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
  const gridRef = useRef(null);
  const brushBarRef = useRef(null);
  const paintingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [dayheadTop, setDayheadTop] = useState(0);

  const zoneList = zones && zones.length ? zones : ['UTC'];
  const labelSets = useMemo(
    () => zoneList.map((z) => rowLabelsInZone(grid, z)),
    [grid, zoneList.join('|')],
  );
  const primaryLabels = labelSets[0];

  const scored = useMemo(
    () => (mode === 'heatmap' ? scoreSlots(grid.allKeys, responses || []) : null),
    [mode, grid, responses],
  );
  const topScore = scored ? Math.max(1, maxScore(scored)) : 1;

  // Keep day headers stuck just below the sticky brush bar (JS-measured,
  // like the original tool).
  useLayoutEffect(() => {
    if (mode !== 'edit') return;
    const el = brushBarRef.current;
    if (!el) return;
    const measure = () => setDayheadTop(el.offsetHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mode]);

  const nLevels = levels?.length || 3;

  function applyBrushTo(cellEl) {
    const key = cellEl?.dataset?.key;
    if (!key) return;
    onPaint(key, brush);
  }

  function paintAt(x, y) {
    const target = document.elementFromPoint(x, y);
    const cell = target && target.closest('.cell');
    if (cell && gridRef.current?.contains(cell)) applyBrushTo(cell);
  }

  function onPointerDown(e) {
    if (mode !== 'edit') return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    paintingRef.current = true;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    applyBrushTo(cell);
    try {
      gridRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  }

  function onPointerMove(e) {
    if (!paintingRef.current) return;
    // interpolate so fast drags don't skip cells between move events
    const a = lastPointRef.current || { x: e.clientX, y: e.clientY };
    const b = { x: e.clientX, y: e.clientY };
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12));
    for (let i = 1; i <= steps; i++) {
      paintAt(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    }
    lastPointRef.current = b;
  }

  function stopPainting() {
    paintingRef.current = false;
  }

  const nZones = zoneList.length;
  const nCols = grid.columns.length;
  const templateColumns = `repeat(${nZones}, minmax(48px, auto)) repeat(${nCols}, minmax(40px, 1fr))`;

  return (
    <div>
      {mode === 'edit' && (
        <div className="brush-bar" ref={brushBarRef} role="toolbar" aria-label="Choose what to paint">
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
      <div className="grid-scroll">
        <div
          className={'grid' + (mode === 'heatmap' ? ' heatmap' : '')}
          style={{ gridTemplateColumns: templateColumns, '--dayhead-top': dayheadTop + 'px' }}
          ref={gridRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopPainting}
          onPointerCancel={stopPainting}
        >
          {/* zone header row */}
          {zoneList.map((z) => (
            <div key={'zh' + z} className="zonehead">
              {nZones > 1 || z !== 'UTC' ? zoneLabel(z) : ''}
            </div>
          ))}
          {grid.columns.map((col) => {
            const d = DateTime.fromISO(col.date);
            const meta = dateMeta[col.date] || {};
            return (
              <div
                key={'dh' + col.date}
                className={'dayhead' + (meta.suggested && !meta.approved ? ' pending' : '')}
              >
                {d.toFormat('ccc')}
                <span className="date">{d.toFormat('d LLL')}</span>
              </div>
            );
          })}
          {/* body rows */}
          {primaryLabels.map((_, r) => (
            <React.Fragment key={'row' + r}>
              {labelSets.map((set, zi) => (
                <div
                  key={'tl' + zi}
                  className={'timelabel' + (primaryLabels[r].hourline ? ' hourline' : '')}
                >
                  {set[r].label || '·'}
                </div>
              ))}
              {grid.columns.map((col, ci) => {
                const key = col.keys[r];
                const hourClass = primaryLabels[r].hourline ? ' hourline' : '';
                if (key === null) {
                  return <div key={'c' + ci} className={'cell gap' + hourClass} />;
                }
                if (mode === 'edit') {
                  const v = Number(availability?.[key]) || 0;
                  const c = levelColor(v, nLevels);
                  return (
                    <button
                      key={'c' + ci}
                      type="button"
                      data-key={key}
                      className={'cell' + (c.striped ? ' striped' : '') + hourClass}
                      style={{ backgroundColor: c.bg }}
                      aria-label={`${formatSlotInZone(key, zoneList[0])}: ${levels[v]}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onPaint(key, brush);
                        }
                      }}
                    />
                  );
                }
                // heatmap
                const s = scored.get(key) || { score: 0, available: 0 };
                const frac = s.score / topScore;
                return (
                  <button
                    key={'c' + ci}
                    type="button"
                    data-key={key}
                    className={'hcell' + hourClass + (selectedKey === key ? ' selected' : '')}
                    style={
                      s.score > 0
                        ? {
                            background: `rgba(71, 191, 175, ${0.15 + 0.85 * frac})`,
                            color: frac > 0.6 ? '#fff' : undefined,
                          }
                        : undefined
                    }
                    title={`${formatSlotInZone(key, zoneList[0])} — ${s.available} available`}
                    aria-label={`${formatSlotInZone(key, zoneList[0])}: score ${s.score}, ${s.available} available`}
                    onClick={() => onSelectSlot?.(key)}
                  >
                    {s.score ? String(s.score) : ''}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
