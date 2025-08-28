import { SearchResult } from '../types';

const API = 'https://www.googleapis.com/customsearch/v1';
const key = process.env.GOOGLE_CSE_API_KEY;
const cx = process.env.GOOGLE_CSE_CX;

export async function searchCSE(q: string, n = 5): Promise<SearchResult[]> {
  if (!key || !cx) return [];
  const params = new URLSearchParams({ q, key, cx, num: String(n) });
  const url = `${API}?${params.toString()}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j.items || []).map((it: any) => ({ url: it.link, title: it.title, snippet: it.snippet }));
}

export async function findSocialLinks(name: string): Promise<{ wiki?: SearchResult; insta?: SearchResult; fb?: SearchResult; x?: SearchResult; }> {
  const [wiki, insta, fb, x] = await Promise.all([
    searchCSE(`${name} site:wikipedia.org`, 1),
    searchCSE(`${name} site:instagram.com`, 1),
    searchCSE(`${name} site:facebook.com`, 1),
    searchCSE(`${name} site:twitter.com OR site:x.com`, 1)
  ]);
  return { wiki: wiki[0], insta: insta[0], fb: fb[0], x: x[0] };
}
