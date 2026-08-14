/**
 * localIdentity.js — remembers which response on each event belongs to this
 * device, so returning visitors land straight on their own entry. This is
 * deliberately client-side only (same trust model as the earlier scheduler):
 * anyone can open anyone's unclaimed entry after a confirmation dialog, and
 * real protection comes from claiming a response with an account.
 *
 * `storage` is injectable for tests; defaults to window.localStorage.
 */

const KEY = 'gotime_my_responses';

function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readMap(storage) {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getMyResponseId(token, storage = defaultStorage()) {
  return readMap(storage)[token] || null;
}

export function setMyResponseId(token, responseId, storage = defaultStorage()) {
  if (!storage) return;
  const map = readMap(storage);
  map[token] = responseId;
  try {
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full/blocked — losing continuity is acceptable */
  }
}

/**
 * Local cache of this device's own submitted entry (identity fields + answers).
 * The server never returns contact details to anonymous callers, so this is
 * how the form gets prefilled when the person comes back — same approach as
 * the earlier scheduler.
 */
const ENTRY_KEY = 'gotime_my_entry';

export function getMyEntryCache(token, storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(`${ENTRY_KEY}_${token}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function setMyEntryCache(token, entry, storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.setItem(`${ENTRY_KEY}_${token}`, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

export function clearMyResponseId(token, storage = defaultStorage()) {
  if (!storage) return;
  const map = readMap(storage);
  delete map[token];
  try {
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
