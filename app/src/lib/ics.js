/**
 * ics.js — minimal iCalendar (RFC 5545) event generation. Pure module.
 * Times are emitted in UTC (Z suffix), which every calendar app converts
 * to the viewer's own zone — no VTIMEZONE blocks needed.
 */

import { parseSlotKey } from './slots.js';

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
  const start = parseSlotKey(startKey);
  const end = start.plus({ minutes: durationMinutes });
  const stamp = utcStamp(start); // deterministic DTSTAMP keeps output reproducible
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GoTime//Scheduling//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid || `${startKey}@gotime`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (url) lines.push(`URL:${escapeText(url)}`);
  if (organizerName) lines.push(`ORGANIZER;CN=${escapeText(organizerName)}:MAILTO:noreply@invalid`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
