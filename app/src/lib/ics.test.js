import { describe, it, expect } from 'vitest';
import { buildICS, escapeText, foldLine, googleCalUrl, outlookCalUrl } from './ics.js';
import { DateTime } from 'luxon';

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

describe('googleCalUrl', () => {
  it('builds a template URL with UTC start/end range and encoded title', () => {
    const u = new URL(
      googleCalUrl({
        title: 'Team planning',
        description: 'Notes',
        startKey: '2026-09-03T13:30Z',
        durationMinutes: 60,
        url: 'https://example.com/e/abc',
      }),
    );
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('Team planning');
    expect(u.searchParams.get('dates')).toBe('20260903T133000Z/20260903T143000Z');
    expect(u.searchParams.get('details')).toContain('https://example.com/e/abc');
  });
});

describe('outlookCalUrl', () => {
  it('builds a compose URL with ISO start/end', () => {
    const u = new URL(
      outlookCalUrl({
        title: 'Team planning',
        startKey: '2026-09-03T13:30Z',
        durationMinutes: 30,
      }),
    );
    expect(u.origin + u.pathname).toBe('https://outlook.office.com/calendar/0/deeplink/compose');
    expect(u.searchParams.get('rru')).toBe('addevent');
    expect(u.searchParams.get('subject')).toBe('Team planning');
    expect(u.searchParams.get('startdt')).toBe('2026-09-03T13:30:00Z');
    expect(u.searchParams.get('enddt')).toBe('2026-09-03T14:00:00Z');
  });
});

describe('all-day (day-granularity) events', () => {
  it('emits DATE values with an exclusive next-day DTEND', () => {
    const ics = buildICS({
      title: 'Lilongwe visit',
      startKey: '2026-09-03',
      uid: 'day-1@gotime',
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260903');
    // DTEND is exclusive: a one-day event ends on the 4th.
    expect(ics).toContain('DTEND;VALUE=DATE:20260904');
    // No datetime forms of DTSTART/DTEND (DTSTAMP stays a UTC timestamp).
    expect(ics).not.toMatch(/DTSTART:\d{8}T/);
    expect(ics).not.toMatch(/DTEND:\d{8}T/);
  });

  it('uses plain dates in the Google URL', () => {
    const u = new URL(googleCalUrl({ title: 'Visit', startKey: '2026-09-03' }));
    expect(u.searchParams.get('dates')).toBe('20260903/20260904');
  });

  it('uses plain dates and allday=true in the Outlook URL', () => {
    const u = new URL(outlookCalUrl({ title: 'Visit', startKey: '2026-09-03' }));
    expect(u.searchParams.get('startdt')).toBe('2026-09-03');
    expect(u.searchParams.get('enddt')).toBe('2026-09-04');
    expect(u.searchParams.get('allday')).toBe('true');
  });
});

describe('recurring (week-key) slots', () => {
  const from = DateTime.fromISO('2026-09-09T12:00', { zone: 'Europe/London' }); // Wednesday
  const args = {
    title: 'Weekly sync',
    description: 'Agenda in the doc',
    startKey: 'D2T10:00', // Tuesdays 10:00 London
    durationMinutes: 30,
    url: 'https://example.com/e/abc',
    eventZone: 'Europe/London',
    from,
  };

  it('buildICS pins the start to the event zone and repeats weekly', () => {
    const ics = buildICS({ ...args, uid: 'evt-w@gotime' });
    expect(ics).toContain('DTSTART;TZID=Europe/London:20260915T100000');
    expect(ics).toContain('DTEND;TZID=Europe/London:20260915T103000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(ics).toContain('Repeats weekly on Tuesdays.');
    expect(ics).not.toMatch(/(?<!\r)\n/);
  });

  it('buildICS writes a UTC event in the plain Z form', () => {
    const ics = buildICS({ ...args, eventZone: 'UTC', from: from.toUTC() });
    expect(ics).toContain('DTSTART:20260915T100000Z');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
  });

  it('googleCalUrl adds the recurrence and the zone', () => {
    const u = new URL(googleCalUrl(args));
    expect(u.searchParams.get('dates')).toBe('20260915T090000Z/20260915T093000Z'); // BST = UTC+1
    expect(u.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(u.searchParams.get('ctz')).toBe('Europe/London');
  });

  it('outlookCalUrl opens the next occurrence and says it repeats', () => {
    const u = new URL(outlookCalUrl(args));
    expect(u.searchParams.get('startdt')).toBe('2026-09-15T09:00:00Z');
    expect(u.searchParams.get('body')).toContain('Repeats weekly on Tuesdays.');
  });
});
