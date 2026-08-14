/**
 * supabaseClient.js — connection details and a lazily-created client.
 *
 * The publishable key is *designed* to ship in the browser: it can do nothing
 * on its own, because every table is protected by Row Level Security and all
 * anonymous access goes through security-definer functions that check the
 * event's share token. It is committed deliberately so the app works without
 * build-time configuration, and can still be overridden per environment with
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 *
 * The service_role key must NEVER appear in this file, this repo, or any
 * frontend bundle — it bypasses RLS entirely.
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL || 'https://huahyyikgfqhficrdhbd.supabase.co';

export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CZNr1W-n_jnW8zI7dm_PLQ_UCIKA4uT';

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let clientPromise = null;

/**
 * Returns a supabase-js client, or null when the backend is unavailable.
 * Imported dynamically so a failure to load never stops the app rendering.
 */
export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }),
      )
      .catch((err) => {
        console.warn('[supabase] client unavailable:', err?.message);
        return null;
      });
  }
  return clientPromise;
}

/** Turn a Supabase error into something a user can act on. */
export function friendlyError(error) {
  const message = String(error?.message || error || 'Something went wrong');
  if (/rate limit|too many/i.test(message))
    return 'Too many attempts just now. Wait a minute and try again.';
  if (/failed to fetch|networkerror/i.test(message))
    return 'Could not reach the server — check your connection and try again.';
  if (/event_locked/i.test(message))
    return 'This form has been locked by the organizer, so responses can no longer be changed.';
  if (/response_claimed/i.test(message))
    return 'This response is linked to an account, so only its owner can edit it. Sign in with that account to make changes.';
  if (/suggestions_disabled/i.test(message))
    return 'The organizer has not enabled date suggestions for this event.';
  if (/not_found/i.test(message))
    return 'This event could not be found — check that the link is complete.';
  if (/not_organizer/i.test(message))
    return 'Only an organizer of this event can do that.';
  return message;
}
