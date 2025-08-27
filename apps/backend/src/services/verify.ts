import type { } from './summarize.js';

export function mockVerify(cites: any[]) {
  // naive: >= 3 cites → high
  if ((cites?.length || 0) >= 3) return 'high';
  if ((cites?.length || 0) >= 1) return 'medium';
  return 'low';
}
