/**
 * levelColors.js — cell colours for N preference levels (2–6).
 * Level 0 is always "not available" grey; the top level is always green;
 * middle levels ramp orange → amber → light green and are additionally
 * striped by the grid so they read without colour.
 */

const GREY = { bg: '#e4e9ee', ink: '#7a8896', striped: false };
const GREEN = { bg: '#4caf6d', ink: '#ffffff', striped: false };

const MIDS = {
  1: [{ bg: '#f6c453', ink: '#5c4400' }],
  2: [
    { bg: '#f09a5c', ink: '#5c2f00' },
    { bg: '#f6c453', ink: '#5c4400' },
  ],
  3: [
    { bg: '#f09a5c', ink: '#5c2f00' },
    { bg: '#f6c453', ink: '#5c4400' },
    { bg: '#bcd77c', ink: '#33471a' },
  ],
  4: [
    { bg: '#ee8552', ink: '#521f00' },
    { bg: '#f0a95c', ink: '#5c3500' },
    { bg: '#f6c453', ink: '#5c4400' },
    { bg: '#bcd77c', ink: '#33471a' },
  ],
};

/** Style for level i of n. */
export function levelColor(i, n) {
  if (i <= 0) return GREY;
  if (i >= n - 1) return GREEN;
  const mids = MIDS[n - 2] || MIDS[1];
  const mid = mids[Math.min(i - 1, mids.length - 1)];
  return { ...mid, striped: true };
}
