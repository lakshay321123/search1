import type { SearchResult } from '../types';

export async function searchBrave(q: string): Promise<SearchResult[]> {
  const token = process.env.BRAVE_API_KEY;
  if (!token) return [];
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`, {
    headers: { 'X-Subscription-Token': token },
  });
  if (!r.ok) return [];
  const j = await r.json();
  const arr = (j.web?.results || []) as any[];
  return arr.slice(0, 5).map((x) => ({ title: x.title, url: x.url, snippet: x.description, source: 'brave' }));
}
