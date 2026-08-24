/**
 * clockFormat.js — the respondent's 12h/24h display preference. Pure module.
 *
 * Display-only: slot keys and everything saved stay UTC instants regardless.
 * The default follows the browser locale (AM/PM in Canada/US English,
 * 24-hour most other places), and an explicit choice is remembered per
 * device in localStorage, like the timezone choice.
 */

const KEY = 'gotime_hour12';

export function detectHour12() {
  try {
    return Boolean(
      new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12,
    );
  } catch {
    return false;
  }
}

export function loadHour12() {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* storage unavailable */
  }
  return detectHour12();
}

export function storeHour12(hour12) {
  try {
    window.localStorage.setItem(KEY, hour12 ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}
