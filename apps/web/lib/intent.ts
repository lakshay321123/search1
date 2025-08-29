export type Intent = 'people' | 'company' | 'local' | 'general';

export function detectIntent(q: string): Intent {
  const s = q.trim().toLowerCase();

  // must-catch local phrases
  if (/\bnear\s*me\b|\bnearby\b/.test(s)) return 'local';

  // "doc", "dr", "gp" synonyms → doctor/clinic intent
  if ((/\b(doc|dr|gp|doctor|clinic|hospital|dentist|pharmacy|restaurant|cafe|bank|atm|lawyer|attorney|advocate)\b/.test(s))
      && (/\b(near|me|nearby)\b/.test(s))) return 'local';

  if (/\bwho\s+is\b/.test(s)) return 'people';

  // short, name-like queries → people
  const words = s.split(/\s+/);
  if (words.length <= 4 && /^[a-z .'-]+$/.test(s)) return 'people';

  // org/company hints
  if (/\b(ltd|limited|inc|llc|plc|pvt|private|company|corp|corporation|co\.|enterprises|labs)\b/.test(s)) return 'company';

  return 'general';
}
