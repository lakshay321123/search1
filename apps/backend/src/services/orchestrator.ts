import { nanoid } from 'nanoid';
import type { AskBody } from '../types.js';
import { mockSearch } from './search.js';
import { mockSummarize } from './summarize.js';
import { mockVerify } from './verify.js';

/**
 * Async generator that yields SSE payloads:
 * {event:'token', text}, {event:'cite', cite}, ... then final snapshot.
 */
export async function* planAndAnswer(body: AskBody) {
  const id = nanoid();
  const { query, style = 'simple' } = body;

  // 1) search (mock)
  const links = await mockSearch(query);

  // 2) summarize with inline citations (mock)
  const { tokens, cites } = await mockSummarize(query, links, style);

  // Stream tokens
  for (const t of tokens) {
    yield { event: 'token', text: t };
    await new Promise(r => setTimeout(r, 10));
  }

  // Emit citations
  for (const c of cites) {
    yield { event: 'cite', cite: c };
  }

  // Verify (mock confidence)
  const confidence = mockVerify(cites);

  // Final snapshot
  const markdown = tokens.join('');
  yield {
    event: 'final',
    snapshot: {
      id,
      markdown,
      cites,
      timeline: [],
      confidence
    }
  };
}
