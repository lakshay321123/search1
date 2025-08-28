import type { SearchResult } from '../types';

export async function searchGoogleCSE(q: string): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=5`;
  const r = await fetch(url, { headers: { 'User-Agent': 'WizkidBot/0.1' } });
  if (!r.ok) return [];
  const j = await r.json();
  const items = (j.items || []) as any[];
  return items.slice(0, 5).map((it) => ({
    title: it.title,
    url: it.link,
    snippet: it.snippet,
    source: 'google',
  }));
}
