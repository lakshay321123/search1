export type Intent = 'people' | 'company' | 'local' | 'general';

export function detectIntent(q: string): Intent {
  const s = q.trim().toLowerCase();
  if (/\bnear\s*me\b|\bnearby\b/.test(s)) return 'local';
  if (/\b(doctor|clinic|hospital|dentist|pharmacy|restaurant|cafe|bank|atm|lawyer|attorney|advocate|property)\b/.test(s) && /\b(near|me|nearby)\b/.test(s)) return 'local';
  if (/\bwho\s+is\b/.test(s)) return 'people';
  const words = s.split(/\s+/);
  if (words.length <= 4 && /^[a-z .'-]+$/.test(s)) return 'people';
  if (/\b(ltd|limited|inc|llc|plc|pvt|private|company|corp|co\.|enterprises)\b/.test(s)) return 'company';
  return 'general';
}
