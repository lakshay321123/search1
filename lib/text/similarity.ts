export function normalizeName(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
export function tokenSet(s: string): Set<string> { return new Set(normalizeName(s).split(' ').filter(Boolean)); }
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0; for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
export function nameScore(query: string, candidate: string): number {
  const qn = normalizeName(query), cn = normalizeName(candidate);
  if (!qn || !cn) return 0;
  if (qn === cn) return 1;
  const jq = jaccard(tokenSet(qn), tokenSet(cn));
  const prefix = (cn.startsWith(qn) || qn.startsWith(cn)) ? 0.15 : 0;
  return Math.min(1, jq + prefix);
}
