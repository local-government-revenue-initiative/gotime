import { describe, it, expect } from 'vitest';
import { scoreSlots, maxScore, bestSlots, slotBreakdown, questionTallies } from './aggregate.js';

const K1 = '2026-09-03T08:00Z';
const K2 = '2026-09-03T08:30Z';
const K3 = '2026-09-03T09:00Z';

const responses = [
  { name: 'Ama', availability: { [K1]: 2, [K2]: 1 } },
  { name: 'Ben', availability: { [K1]: 2, [K3]: 2 } },
  { name: 'Cleo', availability: { [K2]: 1 } },
];

describe('scoreSlots', () => {
  it('sums level indices and counts availability', () => {
    const scored = scoreSlots([K1, K2, K3], responses);
    expect(scored.get(K1)).toEqual({ score: 4, counts: { 2: 2, 0: 1 }, available: 2 });
    expect(scored.get(K2)).toEqual({ score: 2, counts: { 1: 2, 0: 1 }, available: 2 });
    expect(scored.get(K3)).toEqual({ score: 2, counts: { 2: 1, 0: 2 }, available: 1 });
  });

  it('treats missing keys as level 0', () => {
    const scored = scoreSlots([K1], [{ name: 'x', availability: {} }]);
    expect(scored.get(K1).score).toBe(0);
  });
});

describe('maxScore / bestSlots', () => {
  it('finds the max and ranks slots', () => {
    const scored = scoreSlots([K1, K2, K3], responses);
    expect(maxScore(scored)).toBe(4);
    const best = bestSlots(scored, 2);
    expect(best[0].key).toBe(K1);
    // K2 and K3 tie on score 2; K2 has more people available.
    expect(best[1].key).toBe(K2);
  });

  it('breaks full ties chronologically and skips zero scores', () => {
    const scored = scoreSlots([K3, K2], [{ name: 'a', availability: { [K2]: 1, [K3]: 1 } }]);
    const best = bestSlots(scored, 5);
    expect(best.map((b) => b.key)).toEqual([K2, K3]);
    const none = bestSlots(scoreSlots([K1], []), 5);
    expect(none).toEqual([]);
  });
});

describe('slotBreakdown', () => {
  it('groups respondents by level, clamping bad values', () => {
    const byLevel = slotBreakdown(K1, [...responses, { name: 'Odd', availability: { [K1]: 99 } }], 3);
    expect(byLevel[2].map((r) => r.name)).toEqual(['Ama', 'Ben', 'Odd']);
    expect(byLevel[0].map((r) => r.name)).toEqual(['Cleo']);
  });
});

describe('questionTallies', () => {
  const questions = [
    { id: 'q1', type: 'single', label: 'Attend how?', options: ['In person', 'Remote'] },
    { id: 'q2', type: 'multi', label: 'Days?', options: ['Mon', 'Tue'] },
    { id: 'q3', type: 'text', label: 'Notes?' },
  ];
  const answers = [
    { name: 'Ama', answers: { q1: 'Remote', q2: ['Mon', 'Tue'], q3: 'hello' } },
    { name: 'Ben', answers: { q1: 'Remote', q2: [], q3: '  ' } },
  ];

  it('tallies single and multi selects', () => {
    const [t1, t2] = questionTallies(questions, answers);
    expect(t1.counts).toEqual({ 'In person': 0, Remote: 2 });
    expect(t1.answered).toBe(2);
    expect(t2.counts).toEqual({ Mon: 1, Tue: 1 });
    expect(t2.answered).toBe(1);
  });

  it('collects non-empty texts with names', () => {
    const t3 = questionTallies(questions, answers)[2];
    expect(t3.texts).toEqual([{ name: 'Ama', text: 'hello' }]);
    expect(t3.answered).toBe(1);
  });

  it('ignores answer values not in options', () => {
    const [t1] = questionTallies(questions, [{ name: 'x', answers: { q1: 'Hacked' } }]);
    expect(t1.counts).toEqual({ 'In person': 0, Remote: 0 });
  });
});
