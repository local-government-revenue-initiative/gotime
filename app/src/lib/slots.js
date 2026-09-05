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
 *
 * Two other key shapes exist for the other granularities — see dayKey and
 * weekKey below. Every key shape sorts chronologically as a plain string,
 * which the aggregation code relies on.
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

/**
 * Week-granularity (recurring meeting) events key slots by ISO weekday and
 * wall-clock time in the EVENT's zone: "D2T10:00" is Tuesdays at 10:00
 * where the organizer is. A wall time rather than an instant, because a
 * weekly meeting is pinned to the organizer's clock and keeps its local
 * time across daylight-saving changes. Converting to another zone therefore
 * needs a concrete week to do the arithmetic in — see weekKeyToInstant.
 *
 * Monday = 1 … Sunday = 7, so keys sort Monday-first, then by time.
 */
export const WEEKDAY_NAMES = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
export const WEEKDAY_SHORT = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

export function weekKey(weekday, time) {
  return `D${weekday}T${time}`;
}

/** "D2T10:00" -> { weekday: 2, time: "10:00", hour: 10, minute: 0 }. */
export function parseWeekKey(key) {
  const m = /^D([1-7])T(\d{2}):(\d{2})$/.exec(String(key));
  if (!m) return null;
  return { weekday: Number(m[1]), time: `${m[2]}:${m[3]}`, hour: Number(m[2]), minute: Number(m[3]) };
}

/** True for a weekday key ("D2T10:00"). */
export function isWeekKey(key) {
  return /^D[1-7]T\d{2}:\d{2}$/.test(String(key));
}

/**
 * The Monday 00:00 that starts the current week in a zone. The reference
 * week for showing a recurring slot in other zones: "Tuesdays 10:00 in
 * London" is shown as whatever that is in the viewer's zone *this week*.
 * A DST change in either zone moves that by an hour for part of the year,
 * which is inherent to recurring meetings — the UI says so.
 */
export function currentWeekStart(zone, now = DateTime.now()) {
  return now.setZone(zone).startOf('week');
}

/**
 * The instant a week key falls on in a reference week, as a Luxon
 * DateTime in the event's zone. `refWeek` is a Monday-00:00 DateTime in
 * that zone (from currentWeekStart); tests pass one explicitly.
 */
export function weekKeyToInstant(key, eventZone, refWeek) {
  const p = parseWeekKey(key);
  const zone = eventZone || 'UTC';
  // Re-anchor in the event zone, so a reference week built elsewhere still
  // lands on the event's own Monday 00:00.
  const base = refWeek ? refWeek.setZone(zone).startOf('week') : currentWeekStart(zone);
  return base.plus({ days: p.weekday - 1 }).set({ hour: p.hour, minute: p.minute, second: 0, millisecond: 0 });
}

/**
 * The next time a recurring slot comes round, on or after `from`, as a
 * DateTime in the event's zone. Used for calendar invites.
 */
export function nextOccurrence(key, eventZone, from = DateTime.now()) {
  const now = from.setZone(eventZone || 'UTC');
  let dt = weekKeyToInstant(key, eventZone, now.startOf('week'));
  if (dt <= now) dt = dt.plus({ weeks: 1 });
  return dt;
}

/** "08:00" -> minutes since midnight. */
export function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalise an organizer's weekday list: ints 1–7, unique, Monday first. */
export function normalizeWeekdays(weekdays) {
  return [...new Set((weekdays || []).map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b);
}

/**
 * Build the grid model for an event.
 *
 * event: { granularity, timezone, slot_minutes, day_start, day_end, weekdays }
 * dates: array of "yyyy-MM-dd" strings (already sorted/filtered by caller).
 * opts.refWeek: reference week for week granularity (defaults to this week).
 *
 * Returns {
 *   rowCount,
 *   slotMinutes,
 *   columns: [{ date, weekday, keys: [key|null per row] }],
 *   allKeys: [every non-null key],
 *   zone, refWeek        // week granularity only
 * }
 *
 * In day granularity there is exactly one row and each column's key is the
 * bare date. In week granularity the columns are the event's weekdays
 * (date is null, weekday is 1–7) and `dates` is ignored.
 */
export function buildSlotGrid(event, dates, opts = {}) {
  if (event.granularity === 'day') {
    const columns = dates.map((date) => ({ date, keys: [dayKey(date)] }));
    return { rowCount: 1, slotMinutes: null, columns, allKeys: dates.map(dayKey) };
  }
  const zone = event.timezone || 'UTC';
  const step = Number(event.slot_minutes) || 30;
  const startMin = timeToMinutes(event.day_start || '08:00');
  const endMin = timeToMinutes(event.day_end || '18:00');
  const rowCount = Math.max(0, Math.floor((endMin - startMin) / step));

  if (event.granularity === 'week') {
    // Wall-clock keys: no instants, so no DST gaps to leave in the grid.
    const columns = [];
    const allKeys = [];
    for (const weekday of normalizeWeekdays(event.weekdays)) {
      const keys = [];
      for (let r = 0; r < rowCount; r++) {
        const key = weekKey(weekday, minutesToTime(startMin + r * step));
        keys.push(key);
        allKeys.push(key);
      }
      columns.push({ date: null, weekday, keys });
    }
    return {
      rowCount,
      slotMinutes: step,
      columns,
      allKeys,
      zone,
      refWeek: opts.refWeek || currentWeekStart(zone),
    };
  }

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

/** A key's start as a DateTime in `zone`; week keys go via the grid's reference week. */
function keyInZone(key, zone, eventZone, refWeek) {
  if (isWeekKey(key)) return weekKeyToInstant(key, eventZone, refWeek).setZone(zone);
  return parseSlotKey(key).setZone(zone);
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
    const local = keyInZone(col.keys[r], zone, grid.zone, grid.refWeek);
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
      const t = keyInZone(key, zone, grid.zone, grid.refWeek).toFormat('HH:mm');
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
 *
 * Week keys render as "Tuesday, 10:00". Pass opts.eventZone (and optionally
 * opts.refWeek) to convert into `zone`; without it the key's own wall time
 * is shown, which is the event-zone time.
 */
export function formatSlotInZone(key, zone, opts = {}) {
  const time = opts.hour12 ? 'h:mm a' : 'HH:mm';
  if (isDayKey(key)) {
    return parseDayKey(key).toFormat('ccc d LLL yyyy');
  }
  if (isWeekKey(key)) {
    const p = parseWeekKey(key);
    const dt = opts.eventZone
      ? weekKeyToInstant(key, opts.eventZone, opts.refWeek).setZone(zone)
      : DateTime.fromObject({ hour: p.hour, minute: p.minute }, { zone: 'utc' }).set({ weekday: p.weekday });
    return dt.toFormat(opts.timeOnly ? time : `cccc, ${time}`);
  }
  const dt = parseSlotKey(key).setZone(zone);
  return dt.toFormat(opts.timeOnly ? time : `ccc d LLL, ${time}`);
}

/** Sort helper: slot keys are ISO-UTC so plain string sort is chronological. */
export function sortSlotKeys(keys) {
  return [...keys].sort();
}
