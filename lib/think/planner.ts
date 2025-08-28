import { detectIntent } from '@/lib/intent';
import { wikiSuggest } from '@/lib/text/spell';
import { nameScore } from '@/lib/text/similarity';

export type Plan = {
  intent: 'people'|'company'|'local'|'general';
  subject: string;
  needLocation?: boolean;
  rewritten?: string;
  notes?: string[];
};

export async function makePlan(query: string): Promise<Plan> {
  const intent = detectIntent(query);
  let subject = query.trim();
  const notes: string[] = [];

  if (intent === 'people') {
    const sug = await wikiSuggest(subject);
    if (sug && nameScore(subject, sug) < 0.7) { notes.push(`spell: ${sug}`); subject = sug; }
  }
  return { intent, subject, notes };
}
