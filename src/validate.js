const clean = (v, max) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

const items = (arr, limit) =>
  (Array.isArray(arr) ? arr : [])
    .slice(0, limit)
    .map((x) => ({ action: clean(x?.action, 200), why: clean(x?.why, 400), impact: clean(x?.impact, 160) }))
    .filter((x) => x.action && x.why);

/** Validate model output before it reaches the UI. Returns null if unusable. */
export function validateAiPlan(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const routine = items(obj.routine, 6);
  const indoor = items(obj.indoor, 6);
  const alternatives = items(obj.alternatives, 6);
  if (!routine.length || !indoor.length || !alternatives.length) return null;
  return { lead: clean(obj.lead, 400), routine, indoor, alternatives };
}

/** Pull the first JSON object out of a model reply. */
export function extractJson(text) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
