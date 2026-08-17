/**
 * ics.js — minimal iCalendar (RFC 5545) event generation. Pure module.
 * Times are emitted in UTC (Z suffix), which every calendar app converts
 * to the viewer's own zone — no VTIMEZONE blocks needed.
 */

import { isDayKey, parseDayKey, parseSlotKey } from './slots.js';

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

/**
 * Build a .ics file body.
 * { title, description, startKey, durationMinutes, url, organizerName, uid }
 */
export function buildICS({ title, description = '', startKey, durationMinutes = 30, url = '', organizerName = '', uid }) {
  const allDay = isDayKey(startKey);
  const start = allDay ? parseDayKey(startKey) : parseSlotKey(startKey);
  const end = allDay ? start.plus({ days: 1 }) : start.plus({ minutes: durationMinutes });
  const stamp = utcStamp(start); // deterministic DTSTAMP keeps output reproducible
  const dateOnly = (dt) => dt.toFormat('yyyyMMdd');
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
    ...(allDay
      ? [`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(end)}`]
      : [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`]),
    `SUMMARY:${escapeText(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (url) lines.push(`URL:${escapeText(url)}`);
  if (organizerName) lines.push(`ORGANIZER;CN=${escapeText(organizerName)}:MAILTO:noreply@invalid`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * start/end of a slot as { start, end, allDay } Luxon DateTimes (UTC).
 * Day keys span one whole day (end exclusive).
 */
function slotRange(startKey, durationMinutes) {
  if (isDayKey(startKey)) {
    const start = parseDayKey(startKey);
    return { start, end: start.plus({ days: 1 }), allDay: true };
  }
  const start = parseSlotKey(startKey);
  return { start, end: start.plus({ minutes: durationMinutes }), allDay: false };
}

function calDescription(description, url) {
  return [description, url && `Respond or see results: ${url}`].filter(Boolean).join('\n\n');
}

/**
 * "Add to Google Calendar" template URL for a slot. Opens a pre-filled new
 * event in the viewer's own Google Calendar (no login handled by us).
 */
export function googleCalUrl({ title, description = '', startKey, durationMinutes = 30, url = '' }) {
  const { start, end, allDay } = slotRange(startKey, durationMinutes);
  // Google takes plain dates for all-day events (end exclusive).
  const fmt = (dt) => (allDay ? dt.toFormat('yyyyMMdd') : dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'"));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: calDescription(description, url),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** "Add to Outlook" (Outlook.com / Microsoft 365 web) compose URL for a slot. */
export function outlookCalUrl({ title, description = '', startKey, durationMinutes = 30, url = '' }) {
  const { start, end, allDay } = slotRange(startKey, durationMinutes);
  const iso = (dt) => (allDay ? dt.toFormat('yyyy-MM-dd') : dt.toUTC().toISO({ suppressMilliseconds: true }));
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: iso(start),
    enddt: iso(end),
    body: calDescription(description, url),
    ...(allDay ? { allday: 'true' } : {}),
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}
