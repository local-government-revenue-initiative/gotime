/**
 * respondentFilter.js — pure helpers for the Results page's respondent
 * filter. Organizers often want to see the picture for a subset of people
 * ("only senior staff", "only those joining in person"), so the heatmap and
 * tallies recompute from whatever subset is selected.
 *
 * A filter is just a Set of included response ids; these helpers work out
 * which ids a quick-filter (a question answer) selects.
 */

/** Responses whose id is in `included`. An empty/absent set means "all". */
export function applyFilter(responses, included) {
  if (!included) return responses;
  return responses.filter((r) => included.has(r.id));
}

/**
 * Quick-filter groups available for these responses.
 * questions: organizer-defined questions (single/multi only — free text has
 * no fixed options to group by). Grouping by respondent contact fields ended
 * when the fields did — an organizer who wants to slice by role or
 * organization asks a question for it, and gets the group here for free.
 *
 * Returns [{ key, label, options: [{ value, ids: [responseId] }] }]
 */
export function filterGroups(responses, questions) {
  const groups = [];

  for (const q of questions || []) {
    if (q.type === 'text') continue;
    const byOption = new Map();
    for (const r of responses) {
      const v = r.answers?.[q.id];
      const picked = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
      for (const p of picked) {
        if (!byOption.has(p)) byOption.set(p, []);
        byOption.get(p).push(r.id);
      }
    }
    const options = (q.options || [])
      .filter((opt) => byOption.has(opt))
      .map((opt) => ({ value: opt, ids: byOption.get(opt) }));
    if (options.length) groups.push({ key: `q:${q.id}`, label: q.label, options });
  }


  return groups;
}
