/**
 * slots.js — pure slot/grid math. No React, no network.
 *
 * A "slot key" is the UTC instant of the slot's start, minute precision:
 * "2026-09-03T13:30Z". Storing instants (not wall times) is what makes
 * timezone display a pure rendering concern.
 *
 * The grid is organized by wall-clock time in the EVENT's reference zone:
 * every date column runs from day_start to day_end in that zone, so a
 * "9:00–17:00" event is 9-to-5 on every one of its dates even across a
 * daylight-saving change. Consequences, documented here once:
 *  - A nonexistent local time (spring-forward gap) becomes a null cell —
 *    a visual gap for that date — so the shifted instant Luxon would
 *    produce never collides with a real slot's instant.
 *  - An ambiguous local time (fall-back overlap) takes the earlier offset.
 *  - Row labels shown in another display zone can differ between dates in
 *    the same row; `zoneLabelDrift` detects that so the UI can say so.
 */

import { DateTime } from 'luxon';

/** Format a Luxon DateTime as a slot key (UTC, minute precision). */
export function slotKey(dt) {
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm'Z'");
}

/** Parse a slot key back into a Luxon DateTime (UTC). */
export function parseSlotKey(key) {
  return DateTime.fromISO(key, { zone: 'utc' });
}

/**
 * Day-granularity events use the plain date as the key ("2026-09-03"). A
 * whole day is the same day in every time zone, so day keys carry no time
 * and no zone — which is why day mode skips the zone machinery entirely.
 */
export function dayKey(date) {
  return typeof date === 'string' ? date : date.toFormat('yyyy-MM-dd');
}

export function parseDayKey(key) {
  return DateTime.fromISO(key, { zone: 'utc' });
}

/** True for a date-only key ("2026-09-03"), false for an instant key. */
export function isDayKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key));
}

/** "08:00" -> minutes since midnight. */
export function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Build the grid model for an event.
 *
 * event: { granularity, timezone, slot_minutes, day_start, day_end }
 * dates: array of "yyyy-MM-dd" strings (already sorted/filtered by caller).
 *
 * Returns {
 *   rowCount,
 *   slotMinutes,
 *   columns: [{ date, keys: [key|null per row] }],
 *   allKeys: [every non-null key],
 * }
 *
 * In day granularity there is exactly one row and each column's key is the
 * bare date.
 */
export function buildSlotGrid(event, dates) {
  if (event.granularity === 'day') {
    const columns = dates.map((date) => ({ date, keys: [dayKey(date)] }));
    return { rowCount: 1, slotMinutes: null, columns, allKeys: dates.map(dayKey) };
  }
  const zone = event.timezone || 'UTC';
  const step = Number(event.slot_minutes) || 30;
  const startMin = timeToMinutes(event.day_start || '08:00');
  const endMin = timeToMinutes(event.day_end || '18:00');
  const rowCount = Math.max(0, Math.floor((endMin - startMin) / step));

  const columns = [];
  const allKeys = [];
  for (const date of dates) {
    const [y, mo, d] = date.split('-').map(Number);
    const keys = [];
    for (let r = 0; r < rowCount; r++) {
      const mins = startMin + r * step;
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;
      const dt = DateTime.fromObject({ year: y, month: mo, day: d, hour, minute }, { zone });
      // Spring-forward: a nonexistent wall time is silently shifted by Luxon
      // (02:30 -> 03:30). Detect the shift and leave a gap instead, so the
      // real 03:30 slot keeps its instant to itself.
      const key = dt.isValid && dt.hour === hour && dt.minute === minute ? slotKey(dt) : null;
      if (key !== null) allKeys.push(key);
      keys.push(key);
    }
    columns.push({ date, keys });
  }
  return { rowCount, slotMinutes: step, columns, allKeys };
}

/**
 * Row labels for one display zone, derived from a reference column (the
 * first column that has a key in that row). Returns
 * [{ label, hourline }] — hourline marks rows starting a new hour, which
 * the grid renders with a small gap, and label is "" for rows that would
 * repeat a non-hour time (we label every row; the UI decides density).
 */
export function rowLabelsInZone(grid, zone, hour12 = false) {
  const labels = [];
  for (let r = 0; r < grid.rowCount; r++) {
    const col = grid.columns.find((c) => c.keys[r] !== null);
    // Day granularity has no intra-day time to label.
    if (!col || isDayKey(col.keys[r])) {
      labels.push({ label: '', hourline: false });
      continue;
    }
    const local = parseSlotKey(col.keys[r]).setZone(zone);
    labels.push({
      label: local.toFormat(hour12 ? 'h:mm a' : 'HH:mm'),
      hourline: local.minute === 0 && r > 0,
    });
  }
  return labels;
}

/**
 * True when a display zone's row labels are not the same across all date
 * columns (a daylight-saving change between the event's dates, or a zone
 * whose offset changed). The UI shows a one-line notice when true.
 */
export function zoneLabelDrift(grid, zone) {
  for (let r = 0; r < grid.rowCount; r++) {
    let first = null;
    for (const col of grid.columns) {
      const key = col.keys[r];
      if (key === null) continue;
      if (isDayKey(key)) return false; // whole days: no zone drift possible
      const t = parseSlotKey(key).setZone(zone).toFormat('HH:mm');
      if (first === null) first = t;
      else if (t !== first) return true;
    }
  }
  return false;
}

/**
 * Format a slot key for display, e.g. "Wed 3 Sep, 14:30" — or, with
 * opts.hour12, "Wed 3 Sep, 2:30 PM". Day keys have no time or zone, so they
 * render as "Thu 3 Sep 2026" either way.
 */
export function formatSlotInZone(key, zone, opts = {}) {
  if (isDayKey(key)) {
    return parseDayKey(key).toFormat('ccc d LLL yyyy');
  }
  const dt = parseSlotKey(key).setZone(zone);
  const time = opts.hour12 ? 'h:mm a' : 'HH:mm';
  return dt.toFormat(opts.timeOnly ? time : `ccc d LLL, ${time}`);
}

/** Sort helper: slot keys are ISO-UTC so plain string sort is chronological. */
export function sortSlotKeys(keys) {
  return [...keys].sort();
}
