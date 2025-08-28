import type { SearchResult } from '../types';

export async function searchSerper(q: string): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const r = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q, num: 5 }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  const arr = (j.organic || []) as any[];
  return arr.slice(0, 5).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet, source: 'serper' }));
}
