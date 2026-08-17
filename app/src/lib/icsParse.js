/**
 * icsParse.js — a small iCalendar reader for the "show my busy times"
 * overlay. Pure module, no network.
 *
 * Scope, deliberately narrow: we only need *when the user is busy* inside the
 * window an event covers, to shade cells as a visual aid. So we extract
 * VEVENT start/end pairs and expand simple recurrence. We do not model
 * attendees, alarms, timezone definitions (VTIMEZONE), EXDATE exceptions or
 * exotic RRULE parts — an imperfect overlay is acceptable because it never
 * changes anyone's saved answers.
 *
 * Known limitations (documented rather than hidden):
 *  - RRULE support covers FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL,
 *    COUNT, UNTIL and (for weekly) BYDAY. Other parts are ignored.
 *  - EXDATE is honoured; RDATE and RECURRENCE-ID overrides are not.
 *  - TZID resolution has three tiers (see zoneFor): an IANA name, a known
 *    Windows zone name (Outlook writes TZID="Eastern Standard Time"), or the
 *    document's own VTIMEZONE offset. The last tier ignores daylight saving,
 *    so an event inside DST can land an hour out; a zone we can't place at
 *    all falls back to the viewer's local time.
 */

import { DateTime, FixedOffsetZone, IANAZone } from 'luxon';

const WEEKDAYS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

/**
 * Windows zone names → IANA. Outlook's published calendars label times with
 * Windows names, which Luxon can't resolve, and guessing wrong moves someone's
 * busy times by whole hours. Keyed lower-case. Covers the zones this tool's
 * users coordinate across (see QUICK_ZONES in timezones.js) plus the common
 * rest; anything missing falls through to the VTIMEZONE offset.
 */
const WINDOWS_ZONES = {
  'utc': 'UTC',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Africa/Accra',
  'w. europe standard time': 'Europe/Berlin',
  'romance standard time': 'Europe/Paris',
  'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw',
  'w. central africa standard time': 'Africa/Lagos',
  'south africa standard time': 'Africa/Johannesburg',
  'e. africa standard time': 'Africa/Nairobi',
  'egypt standard time': 'Africa/Cairo',
  'morocco standard time': 'Africa/Casablanca',
  'turkey standard time': 'Europe/Istanbul',
  'arabian standard time': 'Asia/Dubai',
  'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai',
  'tokyo standard time': 'Asia/Tokyo',
  'aus eastern standard time': 'Australia/Sydney',
  'atlantic standard time': 'America/Halifax',
  'eastern standard time': 'America/Toronto',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
  'sa pacific standard time': 'America/Bogota',
  'e. south america standard time': 'America/Sao_Paulo',
};

/** "+0530" / "-0400" / "+053000" → minutes east of UTC. */
function offsetToMinutes(value) {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(value).trim());
  if (!m) return null;
  const [, sign, hh, mm] = m;
  const mins = Number(hh) * 60 + Number(mm);
  return sign === '-' ? -mins : mins;
}

/**
 * Offsets declared by the document's own VTIMEZONE blocks, keyed by TZID.
 * We take the STANDARD sub-block's TZOFFSETTO (falling back to DAYLIGHT when
 * that's all there is) — enough to place an otherwise unknown zone.
 */
function collectVTimezones(lines) {
  const out = {};
  let tzid = null;
  let sub = null;
  let standard = null;
  let daylight = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VTIMEZONE') {
      tzid = null;
      standard = null;
      daylight = null;
      continue;
    }
    if (line === 'END:VTIMEZONE') {
      const offset = standard ?? daylight;
      if (tzid && offset !== null && offset !== undefined) out[tzid] = offset;
      tzid = null;
      continue;
    }
    if (line === 'BEGIN:STANDARD') { sub = 'standard'; continue; }
    if (line === 'BEGIN:DAYLIGHT') { sub = 'daylight'; continue; }
    if (line === 'END:STANDARD' || line === 'END:DAYLIGHT') { sub = null; continue; }
    if (tzid === null && line.startsWith('TZID:')) {
      tzid = line.slice(5).trim().replace(/^"|"$/g, '');
      continue;
    }
    if (line.startsWith('TZOFFSETTO:')) {
      const mins = offsetToMinutes(line.slice('TZOFFSETTO:'.length));
      if (mins === null) continue;
      if (sub === 'standard') standard = mins;
      else if (sub === 'daylight') daylight = mins;
    }
  }
  return out;
}

/**
 * Turn a TZID into something Luxon can use, or null when we can't place it.
 * zonesByTzid comes from collectVTimezones.
 */
function zoneFor(tzid, zonesByTzid = {}) {
  const name = String(tzid ?? '').replace(/^"|"$/g, '').trim();
  if (!name) return null;
  if (IANAZone.isValidZone(name)) return name;
  const mapped = WINDOWS_ZONES[name.toLowerCase()];
  if (mapped) return mapped;
  const offset = zonesByTzid[name];
  if (typeof offset === 'number') return FixedOffsetZone.instance(offset);
  return null;
}

/** Undo RFC 5545 line folding: a CRLF followed by space/tab continues a line. */
export function unfold(text) {
  return String(text).replace(/\r?\n[ \t]/g, '');
}

/** Split "DTSTART;TZID=Europe/London:20260903T090000" into parts. */
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1).trim();
  const [name, ...paramParts] = left.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Parse an ICS date/time value into a Luxon DateTime.
 * Handles "20260903T130000Z" (UTC), "20260903T090000" with TZID or floating,
 * and "20260903" (all-day, VALUE=DATE).
 */
export function parseIcsDate(value, params = {}, zonesByTzid = {}) {
  const v = String(value).trim();
  const tz = zoneFor(params.TZID, zonesByTzid);
  const dateOnly = /^\d{8}$/.test(v);
  if (dateOnly) {
    return {
      dt: DateTime.fromFormat(v, 'yyyyMMdd', { zone: tz || 'utc' }),
      allDay: true,
    };
  }
  const m = /^(\d{8})T(\d{6})(Z)?$/.exec(v);
  if (!m) return { dt: DateTime.invalid('unrecognised'), allDay: false };
  const [, d, t, z] = m;
  const zone = z ? 'utc' : tz || 'local';
  return { dt: DateTime.fromFormat(`${d}T${t}`, "yyyyMMdd'T'HHmmss", { zone }), allDay: false };
}

function parseRRule(value) {
  const rule = {};
  for (const part of String(value).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return rule;
}

/**
 * Expand one recurring event into occurrences that overlap
 * [windowStart, windowEnd]. Bounded work: we stop at COUNT/UNTIL, at the
 * window end, or after a hard cap of iterations.
 */
function expand(start, end, rule, windowStart, windowEnd) {
  const out = [];
  const durMs = end.toMillis() - start.toMillis();
  const freq = String(rule.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(rule.INTERVAL, 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL).dt : null;
  const unit = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' }[freq];
  if (!unit) return out; // unsupported FREQ: fall back to the single instance

  // Weekly with BYDAY repeats on several weekdays each week.
  const byDay = (rule.BYDAY || '')
    .split(',')
    .map((d) => WEEKDAYS[d.trim().slice(-2).toUpperCase()])
    .filter(Boolean);

  const MAX = 2000;
  let emitted = 0;
  let cursor = start;
  for (let i = 0; i < MAX; i++) {
    if (until && cursor > until) break;
    if (cursor > windowEnd) break;

    const candidates = [];
    if (freq === 'WEEKLY' && byDay.length) {
      const weekStart = cursor.startOf('week'); // Monday
      for (const wd of byDay) candidates.push(weekStart.plus({ days: wd - 1 }).set({
        hour: start.hour, minute: start.minute, second: start.second,
      }));
    } else {
      candidates.push(cursor);
    }

    for (const c of candidates) {
      if (c < start) continue;
      if (until && c > until) continue;
      if (count !== null && emitted >= count) break;
      const cEnd = c.plus({ milliseconds: durMs });
      if (cEnd > windowStart && c < windowEnd) out.push({ start: c, end: cEnd });
      emitted += 1;
    }
    if (count !== null && emitted >= count) break;
    cursor = cursor.plus({ [unit]: interval });
  }
  return out;
}

/**
 * Parse an ICS document into busy ranges overlapping the given window.
 *
 * text: raw .ics content
 * windowStart / windowEnd: Luxon DateTimes bounding the event being viewed
 *   (recurrence is only expanded inside this window, so a weekly standing
 *   meeting doesn't generate thousands of occurrences).
 *
 * Returns [{ start, end, summary, allDay }] sorted by start.
 */
export function parseBusyRanges(text, windowStart, windowEnd) {
  const lines = unfold(text).split(/\r?\n/);
  const zones = collectVTimezones(lines);
  const busy = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur?.start?.isValid) {
        // No DTEND: all-day events last a day, timed events are treated as
        // zero-length (they still mark their starting slot).
        const end = cur.end?.isValid
          ? cur.end
          : cur.allDay
            ? cur.start.plus({ days: 1 })
            : cur.start;
        const isBusy = !cur.transparent && !cur.free && cur.status !== 'CANCELLED';
        if (isBusy) {
          const occurrences = cur.rrule
            ? expand(cur.start, end, cur.rrule, windowStart, windowEnd)
            : [{ start: cur.start, end }];
          for (const o of occurrences) {
            const skipped = cur.exdates.some((x) => Math.abs(x.diff(o.start).milliseconds) < 1000);
            if (skipped) continue;
            if (o.end > windowStart && o.start < windowEnd) {
              busy.push({
                start: o.start,
                end: o.end,
                summary: cur.summary || '',
                allDay: Boolean(cur.allDay),
              });
            }
          }
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'DTSTART': {
        const { dt, allDay } = parseIcsDate(p.value, p.params, zones);
        cur.start = dt;
        cur.allDay = allDay || p.params.VALUE === 'DATE';
        break;
      }
      case 'DTEND': {
        cur.end = parseIcsDate(p.value, p.params, zones).dt;
        break;
      }
      case 'SUMMARY':
        cur.summary = p.value;
        break;
      case 'RRULE':
        cur.rrule = parseRRule(p.value);
        break;
      case 'EXDATE':
        for (const v of p.value.split(',')) {
          const { dt } = parseIcsDate(v, p.params, zones);
          if (dt.isValid) cur.exdates.push(dt);
        }
        break;
      case 'TRANSP':
        // TRANSPARENT means "free" — don't count it as busy.
        cur.transparent = p.value.toUpperCase() === 'TRANSPARENT';
        break;
      case 'X-MICROSOFT-CDO-BUSYSTATUS':
        // Outlook's own free/busy flag, the only detail a "can view when I'm
        // busy" feed carries. FREE is not busy; TENTATIVE and OOF are (someone
        // provisionally booked or away is not available).
        cur.free = p.value.toUpperCase() === 'FREE';
        break;
      case 'STATUS':
        cur.status = p.value.toUpperCase();
        break;
      default:
        break;
    }
  }

  return busy.sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

/**
 * Which of these slot keys are covered by a busy range?
 * A slot counts as busy when it overlaps a range at all (a meeting from
 * 09:15–09:45 marks both the 09:00 and 09:30 slots).
 * Returns a Set of slot keys.
 */
export function busySlotKeys(keys, busyRanges, slotMinutes, parseKey) {
  const out = new Set();
  if (!busyRanges?.length) return out;
  for (const key of keys) {
    const start = parseKey(key);
    const end = start.plus({ minutes: slotMinutes });
    for (const b of busyRanges) {
      if (b.start < end && b.end > start) {
        out.add(key);
        break;
      }
    }
  }
  return out;
}
