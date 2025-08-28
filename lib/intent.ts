export type Intent = 'people' | 'company' | 'local' | 'general';

export function detectIntent(q: string): Intent {
  const s = q.trim().toLowerCase();

  // LOCAL
  if (/\bnear me\b|\bnearby\b/.test(s)) return 'local';
  if (/\b(doctor|doctors|clinic|clinics|hospital|dentist|pharmacy|restaurant|cafe|bank|atm)\b.*\b(me|near)\b/.test(s)) return 'local';

  // PEOPLE (simple heuristic: two tokens and looks like a name OR contains 'who is')
  if (/\bwho\s+is\b/.test(s)) return 'people';
  const words = s.split(/\s+/);
  if (words.length <= 4 && /^[a-z .'-]+$/.test(s)) return 'people';

  // COMPANY / ORG
  if (/\b(ltd|limited|inc|llc|plc|startup|company|private|pvt)\b/.test(s)) return 'company';

  return 'general';
}
