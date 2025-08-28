export function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function nameScore(a: string, b: string) {
  const ta = normalizeName(a).split(' ').filter(Boolean);
  const tb = normalizeName(b).split(' ').filter(Boolean);
  const setA = new Set(ta);
  let match = 0;
  for (const t of tb) if (setA.has(t)) match++;
  return match / Math.max(1, Math.max(ta.length, tb.length));
}
