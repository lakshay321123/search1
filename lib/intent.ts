export type IntentKind = 'people' | 'local' | 'company' | 'general';

export function detectIntent(q: string): IntentKind {
  const s = q.toLowerCase().trim();
  if (/\bnear me\b/.test(s) || /\bnearby\b/.test(s)) return 'local';
  if (/\bprivate limited\b|\bpvt ltd\b|\blimited\b|\binc\b|\bllc\b|\bltd\b/.test(s)) return 'company';
  // crude person heuristic: 2 tokens, each capitalized or namey words
  if (/^[a-z ]+$/i.test(q) && q.trim().split(/\s+/).length <= 4 && /[a-z]/i.test(q)) return 'people';
  return 'general';
}
