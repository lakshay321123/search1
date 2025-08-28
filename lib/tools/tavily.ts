import type { SearchResult } from '../types';

export async function searchTavily(q: string): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: q, max_results: 5 }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  const arr = (j.results || []) as any[];
  return arr.slice(0, 5).map((x) => ({ title: x.title || x.url, url: x.url, snippet: x.content, source: 'tavily' }));
}
