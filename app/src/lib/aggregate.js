/**
 * aggregate.js — group-view math over responses. Pure module.
 *
 * A response's `availability` maps slot key -> preference level index
 * (0 = not available … highest = most convenient). Missing keys mean 0.
 * A slot's score is the sum of level indices across responses, the same
 * weighting the earlier scheduler used (convenient=2, inconvenient=1).
 */

/**
 * Score every slot. Returns a Map: key -> {
 *   score,               // sum of level indices
 *   counts,              // per-level respondent counts, counts[0] included
 *   available,           // respondents at level >= 1
 * }
 */
export function scoreSlots(keys, responses) {
  const out = new Map();
  for (const key of keys) {
    let score = 0;
    let available = 0;
    const counts = {};
    for (const r of responses) {
      const v = Number(r.availability?.[key]) || 0;
      counts[v] = (counts[v] || 0) + 1;
      score += v;
      if (v >= 1) available += 1;
    }
    out.set(key, { score, counts, available });
  }
  return out;
}

/** Highest score across a scoreSlots() result (0 when empty). */
export function maxScore(scored) {
  let max = 0;
  for (const { score } of scored.values()) if (score > max) max = score;
  return max;
}

/**
 * Top-ranked slots: sorted by score desc, then by most people available,
 * then chronologically (keys are ISO-UTC so string order is time order).
 */
export function bestSlots(scored, limit = 5) {
  return [...scored.entries()]
    .filter(([, s]) => s.score > 0)
    .sort((a, b) => b[1].score - a[1].score || b[1].available - a[1].available || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([key, s]) => ({ key, ...s }));
}

/** Respondents grouped by their level for one slot, for click-for-detail. */
export function slotBreakdown(key, responses, levelCount) {
  const byLevel = Array.from({ length: levelCount }, () => []);
  for (const r of responses) {
    const v = Math.min(Math.max(Number(r.availability?.[key]) || 0, 0), levelCount - 1);
    byLevel[v].push(r);
  }
  return byLevel;
}

/**
 * Tally answers for organizer-defined questions.
 * questions: [{ id, type: 'single'|'multi'|'text', label, options }]
 * responses: [{ name, answers: { [questionId]: value } }]
 * single -> value is a string; multi -> array of strings; text -> string.
 * Returns [{ question, counts: {option: n} | null, texts: [{name, text}] | null, answered }]
 */
export function questionTallies(questions, responses) {
  return questions.map((q) => {
    let answered = 0;
    if (q.type === 'text') {
      const texts = [];
      for (const r of responses) {
        const v = r.answers?.[q.id];
        if (typeof v === 'string' && v.trim()) {
          texts.push({ name: r.name, text: v.trim() });
          answered += 1;
        }
      }
      return { question: q, counts: null, texts, answered };
    }
    const counts = {};
    for (const opt of q.options || []) counts[opt] = 0;
    for (const r of responses) {
      const v = r.answers?.[q.id];
      const picked = q.type === 'multi' ? (Array.isArray(v) ? v : []) : typeof v === 'string' && v ? [v] : [];
      if (picked.length) answered += 1;
      for (const p of picked) if (p in counts) counts[p] += 1;
    }
    return { question: q, counts, texts: null, answered };
  });
}
