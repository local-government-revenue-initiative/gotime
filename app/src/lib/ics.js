/**
 * ics.js — minimal iCalendar (RFC 5545) event generation. Pure module.
 * Times are emitted in UTC (Z suffix), which every calendar app converts
 * to the viewer's own zone — no VTIMEZONE blocks needed.
 *
 * Recurring (week-key) slots are the one exception: a weekly meeting keeps
 * its wall-clock time in the organizer's zone across daylight-saving
 * changes, so its DTSTART carries a TZID and an RRULE repeats it weekly.
 */

import { isDayKey, isWeekKey, parseDayKey, parseSlotKey, parseWeekKey, nextOccurrence, WEEKDAY_NAMES } from './slots.js';

const BYDAY = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };

/** Escape TEXT values: backslash, semicolon, comma, newline. */
export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets with CRLF + space (RFC 5545 §3.1). */
export function foldLine(line) {
  const bytes = (s) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;
  const out = [];
  let current = '';
  for (const ch of line) {
    const prefix = out.length ? ' ' : '';
    if (bytes(prefix + current + ch) > 75) {
      out.push((out.length ? ' ' : '') + current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push((out.length ? ' ' : '') + current);
  return out.join('\r\n');
}

function utcStamp(dt) {
  return dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function localStamp(dt) {
  return dt.toFormat("yyyyMMdd'T'HHmmss");
}

/**
 * start/end of a slot as { start, end, allDay, weekly } Luxon DateTimes.
 * Day keys span one whole day (end exclusive). Week keys resolve to their
 * next occurrence in the event's zone (from `from`, default now) and carry
 * weekly = { weekday, rrule }.
 */
function slotRange(startKey, durationMinutes, eventZone, from) {
  if (isDayKey(startKey)) {
    const start = parseDayKey(startKey);
    return { start, end: start.plus({ days: 1 }), allDay: true, weekly: null };
  }
  if (isWeekKey(startKey)) {
    const { weekday } = parseWeekKey(startKey);
    const start = nextOccurrence(startKey, eventZone, from);
    return {
      start,
      end: start.plus({ minutes: durationMinutes }),
      allDay: false,
      weekly: { weekday, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[weekday]}` },
    };
  }
  const start = parseSlotKey(startKey);
  return { start, end: start.plus({ minutes: durationMinutes }), allDay: false, weekly: null };
}

/**
 * Build a .ics file body.
 * { title, description, startKey, durationMinutes, url, organizerName, uid,
 *   eventZone, from }
 * eventZone matters only for week keys (the zone the recurrence is pinned
 * to); from is the instant to count the first occurrence from (tests).
 */
export function buildICS({
  title,
  description = '',
  startKey,
  durationMinutes = 30,
  url = '',
  organizerName = '',
  uid,
  eventZone = 'UTC',
  from,
}) {
  const { start, end, allDay, weekly } = slotRange(startKey, durationMinutes, eventZone, from);
  const stamp = utcStamp(start); // deterministic DTSTAMP keeps output reproducible
  const dateOnly = (dt) => dt.toFormat('yyyyMMdd');
  // Recurring: a zoned wall time, so the meeting stays at (say) 10:00 London
  // through DST changes. UTC itself is written in the plain Z form, as the
  // spec prefers.
  const zoned = weekly && eventZone && eventZone !== 'UTC';
  const stampPair = allDay
    ? [`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(end)}`]
    : zoned
      ? [`DTSTART;TZID=${eventZone}:${localStamp(start)}`, `DTEND;TZID=${eventZone}:${localStamp(end)}`]
      : [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Go Time//Scheduling//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid || `${startKey}@gotime`)}`,
    `DTSTAMP:${stamp}`,
    // All-day events use DATE values, and DTEND is *exclusive* — a one-day
    // event ends on the following date, or calendars show it as zero-length.
    ...stampPair,
    ...(weekly ? [`RRULE:${weekly.rrule}`] : []),
    `SUMMARY:${escapeText(title)}`,
  ];
  const desc = calDescription(description, url, weekly);
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  if (url) lines.push(`URL:${escapeText(url)}`);
  if (organizerName) lines.push(`ORGANIZER;CN=${escapeText(organizerName)}:MAILTO:noreply@invalid`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function calDescription(description, url, weekly) {
  return [
    description,
    weekly && `Repeats weekly on ${WEEKDAY_NAMES[weekly.weekday]}s.`,
    url && `Respond or see results: ${url}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * "Add to Google Calendar" template URL for a slot. Opens a pre-filled new
 * event in the viewer's own Google Calendar (no login handled by us).
 * Week keys add a weekly recurrence pinned to the event's zone.
 */
export function googleCalUrl({ title, description = '', startKey, durationMinutes = 30, url = '', eventZone = 'UTC', from }) {
  const { start, end, allDay, weekly } = slotRange(startKey, durationMinutes, eventZone, from);
  // Google takes plain dates for all-day events (end exclusive).
  const fmt = (dt) => (allDay ? dt.toFormat('yyyyMMdd') : dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'"));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: calDescription(description, url, weekly),
    ...(weekly ? { recur: `RRULE:${weekly.rrule}`, ctz: eventZone } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * "Add to Outlook" (Outlook.com / Microsoft 365 web) compose URL for a slot.
 * The compose deep link has no recurrence parameter, so a week key opens
 * its next occurrence and the description says it repeats.
 */
export function outlookCalUrl({ title, description = '', startKey, durationMinutes = 30, url = '', eventZone = 'UTC', from }) {
  const { start, end, allDay, weekly } = slotRange(startKey, durationMinutes, eventZone, from);
  const iso = (dt) => (allDay ? dt.toFormat('yyyy-MM-dd') : dt.toUTC().toISO({ suppressMilliseconds: true }));
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: iso(start),
    enddt: iso(end),
    body: calDescription(description, url, weekly),
    ...(allDay ? { allday: 'true' } : {}),
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}
