export type Intent = 'people' | 'company' | 'local' | 'general';

export function detectIntent(q: string): Intent {
  const s = q.trim().toLowerCase();

  const nearPhrase = /\b(near\s*me|nearby|around\s*me|close\s*by|in\s+my\s+area)\b/;
  const localTerms = /\b(doctor|clinic|hospital|dentist|pharmacy|restaurant|cafe|coffee|bank|atm|lawyer|attorney|advocate|property|notary|plumber|electrician|repair|hotel|gym|school|university|salon|barber|grocery|supermarket|store|chemist)\b/;
  if (nearPhrase.test(s)) return 'local';
  if (localTerms.test(s) && /\b(near|nearby|around|close|me|in)\b/.test(s)) return 'local';

  if (/\bwho\s+is\b/.test(s)) return 'people';

  const words = s.split(/\s+/);
  if (words.length <= 4 && /^[a-z .'-]+$/.test(s)) return 'people';

  if (/\b(ltd|limited|inc|llc|plc|pvt|private|company|corp|co\.|enterprises)\b/.test(s)) return 'company';

  return 'general';
}
