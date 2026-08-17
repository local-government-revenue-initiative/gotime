import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { unfold, parseIcsDate, parseBusyRanges, busySlotKeys } from './icsParse.js';
import { parseSlotKey } from './slots.js';

const WIN_START = DateTime.fromISO('2026-09-01T00:00Z', { zone: 'utc' });
const WIN_END = DateTime.fromISO('2026-10-01T00:00Z', { zone: 'utc' });

function ics(body) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
}

describe('unfold', () => {
  it('joins folded continuation lines', () => {
    expect(unfold('SUMMARY:Long\r\n  title')).toBe('SUMMARY:Long title');
    expect(unfold('A:1\r\nB:2')).toBe('A:1\r\nB:2');
  });
});

describe('parseIcsDate', () => {
  it('parses UTC datetimes', () => {
    const { dt, allDay } = parseIcsDate('20260903T130000Z');
    expect(dt.toISO()).toBe('2026-09-03T13:00:00.000Z');
    expect(allDay).toBe(false);
  });

  it('parses TZID datetimes into that zone', () => {
    const { dt } = parseIcsDate('20260903T090000', { TZID: 'Europe/London' });
    // 09:00 BST = 08:00 UTC
    expect(dt.toUTC().toFormat('HH:mm')).toBe('08:00');
  });

  it('parses all-day date values', () => {
    const { dt, allDay } = parseIcsDate('20260903');
    expect(allDay).toBe(true);
    expect(dt.toFormat('yyyy-MM-dd')).toBe('2026-09-03');
  });

  it('resolves a Windows zone name, quoted as Outlook writes it', () => {
    const { dt } = parseIcsDate('20260903T090000', { TZID: '"Eastern Standard Time"' });
    // 09:00 in Toronto (EDT, UTC-4) on 3 Sep = 13:00 UTC
    expect(dt.toUTC().toFormat('HH:mm')).toBe('13:00');
  });

  it('uses a VTIMEZONE offset for a zone name it does not know', () => {
    const { dt } = parseIcsDate('20260903T090000', { TZID: 'Invented Standard Time' }, {
      'Invented Standard Time': 330, // +05:30
    });
    expect(dt.toUTC().toFormat('HH:mm')).toBe('03:30');
  });

  it('falls back to local time for a TZID it cannot place at all', () => {
    const { dt } = parseIcsDate('20260903T090000', { TZID: 'Nowhere Standard Time' });
    expect(dt.isValid).toBe(true);
    expect(dt.toFormat('HH:mm')).toBe('09:00');
  });
});

describe('parseBusyRanges', () => {
  it('reads a simple timed event', () => {
    const busy = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'SUMMARY:Standup',
          'DTSTART:20260903T090000Z',
          'DTEND:20260903T093000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(busy).toHaveLength(1);
    expect(busy[0].summary).toBe('Standup');
    expect(busy[0].start.toISO()).toBe('2026-09-03T09:00:00.000Z');
    expect(busy[0].end.toISO()).toBe('2026-09-03T09:30:00.000Z');
  });

  it('treats an all-day event as spanning the day', () => {
    const busy = parseBusyRanges(
      ics(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260910', 'END:VEVENT'].join('\r\n')),
      WIN_START,
      WIN_END,
    );
    expect(busy).toHaveLength(1);
    expect(busy[0].allDay).toBe(true);
    expect(busy[0].end.diff(busy[0].start, 'hours').hours).toBe(24);
  });

  it('ignores events outside the window', () => {
    const busy = parseBusyRanges(
      ics(
        ['BEGIN:VEVENT', 'DTSTART:20251201T090000Z', 'DTEND:20251201T100000Z', 'END:VEVENT'].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(busy).toEqual([]);
  });

  it('skips free (TRANSPARENT) and cancelled events', () => {
    const body = [
      'BEGIN:VEVENT',
      'DTSTART:20260903T090000Z',
      'DTEND:20260903T100000Z',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20260904T090000Z',
      'DTEND:20260904T100000Z',
      'STATUS:CANCELLED',
      'END:VEVENT',
    ].join('\r\n');
    expect(parseBusyRanges(ics(body), WIN_START, WIN_END)).toEqual([]);
  });

  it('honours Outlook’s busy status: FREE is free, OOF is busy', () => {
    const body = [
      'BEGIN:VEVENT',
      'SUMMARY:Busy',
      'DTSTART:20260903T090000Z',
      'DTEND:20260903T100000Z',
      'TRANSP:OPAQUE',
      'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Busy',
      'DTSTART:20260904T090000Z',
      'DTEND:20260904T100000Z',
      'X-MICROSOFT-CDO-BUSYSTATUS:OOF',
      'END:VEVENT',
    ].join('\r\n');
    const busy = parseBusyRanges(ics(body), WIN_START, WIN_END);
    expect(busy.map((b) => b.start.toFormat('yyyy-MM-dd'))).toEqual(['2026-09-04']);
  });

  it('reads a busy-only Outlook feed: VTIMEZONE + quoted Windows TZID', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'METHOD:PUBLISH',
      'PRODID:Microsoft Exchange Server 2010',
      'X-PUBLISHED-TTL:PT1H',
      'BEGIN:VTIMEZONE',
      'TZID:Eastern Standard Time',
      'BEGIN:STANDARD',
      'DTSTART:16011104T020000',
      'TZOFFSETFROM:-0400',
      'TZOFFSETTO:-0500',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:16010311T020000',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'SUMMARY:Busy',
      'DTSTART;TZID="Eastern Standard Time":20260903T140000',
      'DTEND;TZID="Eastern Standard Time":20260903T150000',
      'TRANSP:OPAQUE',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const busy = parseBusyRanges(text, WIN_START, WIN_END);
    expect(busy).toHaveLength(1);
    // 14:00 Toronto in September (EDT, UTC-4) = 18:00 UTC — the mapped IANA
    // zone wins over the VTIMEZONE's standard-time offset, so DST is right.
    expect(busy[0].start.toUTC().toISO()).toBe('2026-09-03T18:00:00.000Z');
  });

  it('expands a weekly recurrence inside the window only', () => {
    const busy = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'SUMMARY:Weekly sync',
          'DTSTART:20260903T090000Z', // a Thursday
          'DTEND:20260903T100000Z',
          'RRULE:FREQ=WEEKLY;INTERVAL=1',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    // Thursdays in Sept 2026 from the 3rd: 3, 10, 17, 24
    expect(busy.map((b) => b.start.toFormat('yyyy-MM-dd'))).toEqual([
      '2026-09-03',
      '2026-09-10',
      '2026-09-17',
      '2026-09-24',
    ]);
  });

  it('honours COUNT and UNTIL', () => {
    const counted = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260903T090000Z',
          'DTEND:20260903T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(counted).toHaveLength(3);

    const untilled = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260903T090000Z',
          'DTEND:20260903T100000Z',
          'RRULE:FREQ=DAILY;UNTIL=20260905T235959Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(untilled.map((b) => b.start.toFormat('dd'))).toEqual(['03', '04', '05']);
  });

  it('expands weekly BYDAY across several weekdays', () => {
    const busy = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260907T090000Z', // Monday
          'DTEND:20260907T093000Z',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260918T000000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(busy.map((b) => b.start.toFormat('yyyy-MM-dd'))).toEqual([
      '2026-09-07',
      '2026-09-09',
      '2026-09-14',
      '2026-09-16',
    ]);
  });

  it('skips EXDATE occurrences', () => {
    const busy = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260903T090000Z',
          'DTEND:20260903T100000Z',
          'RRULE:FREQ=DAILY;COUNT=3',
          'EXDATE:20260904T090000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(busy.map((b) => b.start.toFormat('dd'))).toEqual(['03', '05']);
  });

  it('handles folded lines and multiple events, sorted', () => {
    const busy = parseBusyRanges(
      ics(
        [
          'BEGIN:VEVENT',
          'DTSTART:20260910T090000Z',
          'DTEND:20260910T100000Z',
          'SUMMARY:Later meeting with a very long title that has been',
          '  folded across lines',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'DTSTART:20260903T090000Z',
          'DTEND:20260903T100000Z',
          'SUMMARY:Earlier',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WIN_START,
      WIN_END,
    );
    expect(busy.map((b) => b.summary)).toEqual([
      'Earlier',
      'Later meeting with a very long title that has been folded across lines',
    ]);
  });

  it('returns nothing for junk input', () => {
    expect(parseBusyRanges('not a calendar', WIN_START, WIN_END)).toEqual([]);
    expect(parseBusyRanges('', WIN_START, WIN_END)).toEqual([]);
  });
});

describe('busySlotKeys', () => {
  const busy = [
    {
      start: DateTime.fromISO('2026-09-03T09:15Z', { zone: 'utc' }),
      end: DateTime.fromISO('2026-09-03T09:45Z', { zone: 'utc' }),
    },
  ];

  it('marks every slot a busy range overlaps', () => {
    const keys = ['2026-09-03T08:30Z', '2026-09-03T09:00Z', '2026-09-03T09:30Z', '2026-09-03T10:00Z'];
    const out = busySlotKeys(keys, busy, 30, parseSlotKey);
    // 09:15-09:45 overlaps the 09:00 and 09:30 slots, not 08:30 or 10:00.
    expect([...out].sort()).toEqual(['2026-09-03T09:00Z', '2026-09-03T09:30Z']);
  });

  it('is empty when there are no busy ranges', () => {
    expect(busySlotKeys(['2026-09-03T09:00Z'], [], 30, parseSlotKey).size).toBe(0);
  });
});
