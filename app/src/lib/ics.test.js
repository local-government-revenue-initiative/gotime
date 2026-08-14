import { describe, it, expect } from 'vitest';
import { buildICS, escapeText, foldLine } from './ics.js';

describe('escapeText', () => {
  it('escapes special characters', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:Short')).toBe('SUMMARY:Short');
  });
  it('folds long lines at 75 octets with continuation spaces', () => {
    const long = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldLine(long);
    for (const part of folded.split('\r\n')) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});

describe('buildICS', () => {
  it('produces a valid VEVENT with UTC times and CRLF endings', () => {
    const ics = buildICS({
      title: 'Team planning',
      description: 'Line one\nLine two',
      startKey: '2026-09-03T13:30Z',
      durationMinutes: 60,
      url: 'https://example.com/e/abc',
      uid: 'evt-1@gotime',
    });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20260903T133000Z');
    expect(ics).toContain('DTEND:20260903T143000Z');
    expect(ics).toContain('SUMMARY:Team planning');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    expect(ics).toContain('UID:evt-1@gotime');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/); // every newline is CRLF
  });
});
