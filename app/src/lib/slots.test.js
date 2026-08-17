import { describe, it, expect } from 'vitest';
import {
  slotKey,
  parseSlotKey,
  timeToMinutes,
  buildSlotGrid,
  rowLabelsInZone,
  zoneLabelDrift,
  formatSlotInZone,
  sortSlotKeys,
  dayKey,
  isDayKey,
} from './slots.js';
import { DateTime } from 'luxon';

const eventLondon = {
  timezone: 'Europe/London',
  slot_minutes: 30,
  day_start: '09:00',
  day_end: '11:00',
};

describe('slotKey / parseSlotKey', () => {
  it('round-trips through UTC', () => {
    const dt = DateTime.fromISO('2026-09-03T14:30', { zone: 'Europe/London' });
    const key = slotKey(dt);
    expect(key).toBe('2026-09-03T13:30Z'); // BST is UTC+1
    expect(parseSlotKey(key).toISO()).toBe('2026-09-03T13:30:00.000Z');
  });
});

describe('timeToMinutes', () => {
  it('parses HH:MM', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('18:30')).toBe(1110);
  });
});

describe('buildSlotGrid', () => {
  it('builds rows from day range and slot size', () => {
    const grid = buildSlotGrid(eventLondon, ['2026-09-03', '2026-09-04']);
    expect(grid.rowCount).toBe(4); // 9:00 9:30 10:00 10:30
    expect(grid.columns).toHaveLength(2);
    expect(grid.columns[0].keys[0]).toBe('2026-09-03T08:00Z');
    expect(grid.columns[1].keys[3]).toBe('2026-09-04T09:30Z');
    expect(grid.allKeys).toHaveLength(8);
  });

  it('keeps the same wall-clock times across a DST change', () => {
    // Europe/London falls back 2026-10-25: BST (UTC+1) before, GMT after.
    const grid = buildSlotGrid(eventLondon, ['2026-10-24', '2026-10-26']);
    expect(grid.columns[0].keys[0]).toBe('2026-10-24T08:00Z'); // 09:00 BST
    expect(grid.columns[1].keys[0]).toBe('2026-10-26T09:00Z'); // 09:00 GMT
  });

  it('nulls out slots swallowed by spring-forward', () => {
    // North America springs forward 2026-03-08 02:00 -> 03:00.
    const grid = buildSlotGrid(
      { timezone: 'America/Toronto', slot_minutes: 30, day_start: '01:30', day_end: '03:30' },
      ['2026-03-08'],
    );
    // 01:30 exists; 02:00 and 02:30 don't (shift to 03:00/03:30 — the first
    // survives as 03:00's instant?); implementation guarantees: no duplicate
    // instants, count of non-null keys equals distinct instants.
    const keys = grid.columns[0].keys;
    const nonNull = keys.filter(Boolean);
    expect(new Set(nonNull).size).toBe(nonNull.length);
    expect(keys[0]).toBe('2026-03-08T06:30Z'); // 01:30 EST
  });

  it('uses the event zone, not the viewer zone', () => {
    const grid = buildSlotGrid(
      { timezone: 'Africa/Nairobi', slot_minutes: 60, day_start: '09:00', day_end: '12:00' },
      ['2026-09-03'],
    );
    expect(grid.columns[0].keys[0]).toBe('2026-09-03T06:00Z'); // EAT = UTC+3
  });
});

describe('rowLabelsInZone', () => {
  it('labels rows in the requested zone', () => {
    const grid = buildSlotGrid(eventLondon, ['2026-09-03']);
    const london = rowLabelsInZone(grid, 'Europe/London');
    expect(london.map((l) => l.label)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    const toronto = rowLabelsInZone(grid, 'America/Toronto');
    expect(toronto[0].label).toBe('04:00'); // BST 09:00 = EDT 04:00
    const lagos = rowLabelsInZone(grid, 'Africa/Lagos');
    expect(lagos[0].label).toBe('09:00'); // WAT = UTC+1 = BST offset that day
  });

  it('marks hour boundaries for the display zone', () => {
    const grid = buildSlotGrid(eventLondon, ['2026-09-03']);
    const labels = rowLabelsInZone(grid, 'Europe/London');
    expect(labels[2].hourline).toBe(true); // 10:00
    expect(labels[1].hourline).toBe(false); // 09:30
    expect(labels[0].hourline).toBe(false); // first row never gets the gap
  });
});

describe('zoneLabelDrift', () => {
  it('is false when all dates share an offset', () => {
    const grid = buildSlotGrid(eventLondon, ['2026-09-03', '2026-09-04']);
    expect(zoneLabelDrift(grid, 'America/Toronto')).toBe(false);
  });

  it('detects drift across a DST boundary in the display zone', () => {
    // London event spanning the North American fall-back (2026-11-01):
    // Toronto's offset to London changes, so Toronto labels differ by date.
    const grid = buildSlotGrid(eventLondon, ['2026-10-30', '2026-11-02']);
    expect(zoneLabelDrift(grid, 'America/Toronto')).toBe(true);
    expect(zoneLabelDrift(grid, 'Europe/London')).toBe(false);
  });
});

describe('formatSlotInZone / sortSlotKeys', () => {
  it('formats a key in a zone', () => {
    expect(formatSlotInZone('2026-09-03T13:30Z', 'Europe/London')).toBe('Thu 3 Sep, 14:30');
    expect(formatSlotInZone('2026-09-03T13:30Z', 'America/Toronto', { timeOnly: true })).toBe('09:30');
  });

  it('sorts chronologically', () => {
    expect(sortSlotKeys(['2026-10-01T10:00Z', '2026-09-03T13:30Z'])).toEqual([
      '2026-09-03T13:30Z',
      '2026-10-01T10:00Z',
    ]);
  });
});

describe('day granularity', () => {
  const dayEvent = { granularity: 'day', timezone: 'Europe/London' };

  it('isDayKey distinguishes date keys from instant keys', () => {
    expect(isDayKey('2026-09-03')).toBe(true);
    expect(isDayKey('2026-09-03T13:30Z')).toBe(false);
  });

  it('dayKey passes through date strings', () => {
    expect(dayKey('2026-09-03')).toBe('2026-09-03');
  });

  it('builds one row with bare-date keys, one per date', () => {
    const grid = buildSlotGrid(dayEvent, ['2026-09-03', '2026-09-04', '2026-09-07']);
    expect(grid.rowCount).toBe(1);
    expect(grid.slotMinutes).toBeNull();
    expect(grid.columns.map((c) => c.keys)).toEqual([
      ['2026-09-03'],
      ['2026-09-04'],
      ['2026-09-07'],
    ]);
    expect(grid.allKeys).toEqual(['2026-09-03', '2026-09-04', '2026-09-07']);
  });

  it('has no time labels and never reports zone drift', () => {
    // Dates spanning a DST change would drift in time mode.
    const grid = buildSlotGrid(dayEvent, ['2026-10-24', '2026-11-02']);
    expect(rowLabelsInZone(grid, 'America/Toronto')).toEqual([{ label: '', hourline: false }]);
    expect(zoneLabelDrift(grid, 'America/Toronto')).toBe(false);
  });

  it('formats day keys without a time or zone', () => {
    expect(formatSlotInZone('2026-09-03', 'America/Toronto')).toBe('Thu 3 Sep 2026');
    // Instant keys still render with the time.
    expect(formatSlotInZone('2026-09-03T13:30Z', 'Europe/London')).toBe('Thu 3 Sep, 14:30');
  });

  it('ignores day_start/day_end/slot_minutes in day mode', () => {
    const grid = buildSlotGrid(
      { ...dayEvent, day_start: '08:00', day_end: '18:00', slot_minutes: 30 },
      ['2026-09-03'],
    );
    expect(grid.rowCount).toBe(1);
  });
});
