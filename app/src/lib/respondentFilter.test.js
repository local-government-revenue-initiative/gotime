import { describe, it, expect } from 'vitest';
import { applyFilter, filterGroups } from './respondentFilter.js';

const QUESTIONS = [
  { id: 'q1', type: 'single', label: 'Attending how?', options: ['In person', 'Online'] },
  { id: 'q2', type: 'multi', label: 'Topics', options: ['Tax', 'Land'] },
  { id: 'q3', type: 'text', label: 'Notes' },
];

const RESPONSES = [
  {
    id: 'r1', name: 'Ama', position_title: 'Senior Analyst', organization: 'LOGRI',
    answers: { q1: 'Online', q2: ['Tax'], q3: 'hello' },
  },
  {
    id: 'r2', name: 'Ben', position_title: 'Intern', organization: 'LOGRI',
    answers: { q1: 'In person', q2: ['Tax', 'Land'] },
  },
  {
    id: 'r3', name: 'Cleo', position_title: '', organization: 'City Council',
    answers: { q1: 'Online' },
  },
];

describe('applyFilter', () => {
  it('returns everything when no filter is set', () => {
    expect(applyFilter(RESPONSES, null)).toHaveLength(3);
  });

  it('keeps only included ids', () => {
    const out = applyFilter(RESPONSES, new Set(['r1', 'r3']));
    expect(out.map((r) => r.name)).toEqual(['Ama', 'Cleo']);
  });

  it('returns nothing for an empty set', () => {
    expect(applyFilter(RESPONSES, new Set())).toEqual([]);
  });
});

describe('filterGroups', () => {
  it('groups by single and multi question answers, skipping text', () => {
    const groups = filterGroups(RESPONSES, QUESTIONS, false);
    expect(groups.map((g) => g.key)).toEqual(['q:q1', 'q:q2']);

    const q1 = groups[0];
    expect(q1.label).toBe('Attending how?');
    expect(q1.options).toEqual([
      { value: 'In person', ids: ['r2'] },
      { value: 'Online', ids: ['r1', 'r3'] },
    ]);

    const q2 = groups[1];
    expect(q2.options.find((o) => o.value === 'Tax').ids).toEqual(['r1', 'r2']);
    expect(q2.options.find((o) => o.value === 'Land').ids).toEqual(['r2']);
  });

  it('omits options nobody picked', () => {
    const groups = filterGroups([RESPONSES[2]], QUESTIONS, false);
    expect(groups[0].options).toEqual([{ value: 'Online', ids: ['r3'] }]);
  });

  it('excludes contact fields for non-organizers', () => {
    const groups = filterGroups(RESPONSES, QUESTIONS, false);
    expect(groups.some((g) => g.key.startsWith('f:'))).toBe(false);
  });

  it('includes position/organization groups for organizers, ignoring blanks', () => {
    const groups = filterGroups(RESPONSES, QUESTIONS, true);
    const pos = groups.find((g) => g.key === 'f:position_title');
    expect(pos.options).toEqual([
      { value: 'Intern', ids: ['r2'] },
      { value: 'Senior Analyst', ids: ['r1'] },
    ]);
    const org = groups.find((g) => g.key === 'f:organization');
    expect(org.options).toEqual([
      { value: 'City Council', ids: ['r3'] },
      { value: 'LOGRI', ids: ['r1', 'r2'] },
    ]);
  });

  it('handles no questions and no responses', () => {
    expect(filterGroups([], [], true)).toEqual([]);
    expect(filterGroups(RESPONSES, undefined, false)).toEqual([]);
  });
});
