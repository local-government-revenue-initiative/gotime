/**
 * features.js — switches for finished features that are deliberately hidden.
 *
 * Keeping the interface small matters more than showing everything we've built,
 * so a feature can be complete, tested and deployed and still be off here. The
 * code, tests and backend for a switched-off feature stay in place, doing
 * nothing, until it's turned back on.
 *
 * To turn one on:
 *   * for everyone — change its default to true below and deploy; or
 *   * without touching code — set the matching VITE_… variable to "1" in the
 *     Vercel project's Environment Variables and redeploy.
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const on = (name, dflt) => (name in env ? String(env[name]) === '1' : dflt);

/**
 * "My calendar" on the respond page: a signed-in person pastes their published
 * Outlook/Google ICS link and the slots they're busy get a marker.
 * Working and verified against a real Outlook feed; hidden for now to keep the
 * respondent's page as simple as possible while colleagues learn the tool.
 */
export const SHOW_CALENDAR_OVERLAY = on('VITE_SHOW_CALENDAR_OVERLAY', false);
