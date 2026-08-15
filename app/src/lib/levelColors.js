/**
 * levelColors.js — cell colours for N preference levels (2–6).
 * Level 0 is always "not available" grey; the top level is always green;
 * middle levels ramp orange → amber → light green and are additionally
 * striped by the grid so they read without colour.
 */

// LoGRI brand: "not available" grey, most-preferred Sea Turquoise, mid
// levels ramp Earth Brown-ish orange → Sunny Yellow (all striped so the
// states read without colour).
const GREY = { bg: '#e4e9ee', ink: '#7a8896', striped: false };
const TOP = { bg: '#47bfaf', ink: '#0a2f2b', striped: false };

const MIDS = {
  1: [{ bg: '#ffc70a', ink: '#5c4400' }],
  2: [
    { bg: '#f0a05a', ink: '#5c2f00' },
    { bg: '#ffc70a', ink: '#5c4400' },
  ],
  3: [
    { bg: '#f0a05a', ink: '#5c2f00' },
    { bg: '#ffc70a', ink: '#5c4400' },
    { bg: '#b8dcae', ink: '#204a2e' },
  ],
  4: [
    { bg: '#ec8a4e', ink: '#521f00' },
    { bg: '#f6b43a', ink: '#5c3500' },
    { bg: '#ffc70a', ink: '#5c4400' },
    { bg: '#b8dcae', ink: '#204a2e' },
  ],
};

/** Style for level i of n. */
export function levelColor(i, n) {
  if (i <= 0) return GREY;
  if (i >= n - 1) return TOP;
  const mids = MIDS[n - 2] || MIDS[1];
  const mid = mids[Math.min(i - 1, mids.length - 1)];
  return { ...mid, striped: true };
}
