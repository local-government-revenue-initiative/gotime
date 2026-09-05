import { describe, it, expect } from 'vitest';
import { QUICK_ZONES, zoneLabel } from './timezones.js';

describe('QUICK_ZONES', () => {
  it('offers UTC as a one-tap zone', () => {
    expect(QUICK_ZONES.some((q) => q.zone === 'UTC')).toBe(true);
    expect(zoneLabel('UTC')).toBe('UTC');
  });
});
