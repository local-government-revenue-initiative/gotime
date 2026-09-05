/**
 * retry.js — retry a request once when Supabase rejects a freshly minted
 * sign-in token as "issued at future". Pure module.
 *
 * Supabase Auth mints the token on one server and the database API checks
 * it on another; when their clocks differ by a second, a token issued just
 * now is refused. It is transient, so a short pause and one more attempt
 * is the whole fix. Everything else is rethrown untouched.
 */

export const CLOCK_SKEW_RE = /issued at future/i;

export function isClockSkewError(err) {
  return CLOCK_SKEW_RE.test(String(err?.message || err || ''));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run fn(); on a clock-skew error wait and try again (default: twice, 1.5 s
 * apart). Any other error, or a skew error that outlasts the retries, is
 * thrown to the caller as usual.
 */
export async function retryClockSkew(fn, { retries = 2, delayMs = 1500, wait = sleep } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isClockSkewError(err) || attempt >= retries) throw err;
      attempt += 1;
      await wait(delayMs);
    }
  }
}
