import type { SearchResult } from '../types';

export async function searchWikipedia(q: string): Promise<SearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5&utf8=1&origin=*`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  const pages = (j.query?.search || []) as any[];
  return pages.map((p) => ({
    title: p.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/\s/g, '_'))}`,
    snippet: p.snippet?.replace(/<[^>]+>/g, '') || undefined,
    source: 'wikipedia',
  }));
}
