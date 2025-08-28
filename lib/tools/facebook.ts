import type { SearchResult } from '../types';

export async function searchFacebook(q: string): Promise<SearchResult[]> {
  const token = process.env.FB_APP_TOKEN;
  if (!token) return [];
  const PAGE_IDS = (process.env.FB_PAGE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!PAGE_IDS.length) return [];
  const out: SearchResult[] = [];
  for (const id of PAGE_IDS) {
    const r = await fetch(
      `https://graph.facebook.com/v18.0/${id}/posts?fields=message,permalink_url,created_time&limit=5&access_token=${token}`
    );
    if (!r.ok) continue;
    const j = await r.json();
    const posts = (j.data || []) as any[];
    for (const p of posts) {
      const msg = p.message || '';
      if (msg.toLowerCase().includes(q.toLowerCase())) {
        out.push({
          title: (msg || 'Facebook post').slice(0, 80),
          url: p.permalink_url,
          snippet: msg.slice(0, 160),
          source: 'facebook',
        });
      }
    }
  }
  return out.slice(0, 5);
}
