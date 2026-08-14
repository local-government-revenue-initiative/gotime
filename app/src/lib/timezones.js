/**
 * timezones.js — timezone choices and helpers. Pure module.
 *
 * QUICK_ZONES are the zones this tool's users coordinate across most often;
 * they appear as one-tap chips. The full IANA list is still available via
 * the browser's Intl API for everyone else.
 */

import { DateTime } from 'luxon';

export const QUICK_ZONES = [
  { zone: 'America/Toronto', label: 'Toronto' },
  { zone: 'Europe/London', label: 'London' },
  { zone: 'Africa/Freetown', label: 'Sierra Leone (GMT)' },
  { zone: 'Africa/Lagos', label: 'Accra/Lagos (WAT)' },
  { zone: 'Europe/Paris', label: 'CET' },
  { zone: 'Africa/Lusaka', label: 'Lusaka (CAT)' },
  { zone: 'Africa/Nairobi', label: 'Nairobi/Kampala (EAT)' },
];

/** Short display name for a zone: quick-zone label, else "Region/City" tail. */
export function zoneLabel(zone) {
  const quick = QUICK_ZONES.find((q) => q.zone === zone);
  if (quick) return quick.label;
  return String(zone).split('/').pop().replace(/_/g, ' ');
}

/** Browser's zone, with a safe fallback for old environments. */
export function detectZone() {
  const z = DateTime.local().zoneName;
  return z && z !== 'null' ? z : 'UTC';
}

/** Full IANA list when the browser can supply it, else the quick list. */
export function allZones() {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      /* fall through */
    }
  }
  return QUICK_ZONES.map((q) => q.zone);
}

/** "GMT+2" style offset descriptor for a zone right now (UI hint text). */
export function zoneOffsetLabel(zone, at = DateTime.utc()) {
  const dt = at.setZone(zone);
  if (!dt.isValid) return '';
  const mins = dt.offset;
  if (mins === 0) return 'GMT';
  const sign = mins > 0 ? '+' : '-';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

export function isValidZone(zone) {
  return DateTime.local().setZone(zone).isValid;
}
