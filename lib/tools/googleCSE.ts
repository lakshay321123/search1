import type { SearchResult } from '../types';

const CSE_ID = process.env.GOOGLE_CSE_ID;
const CSE_KEY = process.env.GOOGLE_CSE_KEY;

export async function searchCSE(q: string, num: number): Promise<SearchResult[]> {
  if (!CSE_ID || !CSE_KEY) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_ID}&q=${encodeURIComponent(q)}&num=${num}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j: any = await r.json();
    const items = j.items || [];
    return items.map((it: any) => ({
      title: it.title,
      url: it.link,
      snippet: it.snippet,
      domain: (() => { try { return new URL(it.link).hostname.replace(/^www\./,''); } catch { return undefined; } })(),
    }));
  } catch { return []; }
}

function norm(u: string) {
  try { const url = new URL(u); url.hash=''; url.search=''; return url.toString(); } catch { return u; }
}

export async function findSocialLinks(name: string): Promise<Record<string, SearchResult>> {
  const specs = [
    { key: 'wiki', q: `${name} wikipedia`, match: (u: string) => /wikipedia.org/.test(u) },
    { key: 'linkedin', q: `${name} linkedin`, match: (u: string) => /linkedin.com/.test(u) },
    { key: 'insta', q: `${name} instagram`, match: (u: string) => /instagram.com/.test(u) },
    { key: 'fb', q: `${name} facebook`, match: (u: string) => /facebook.com/.test(u) },
    { key: 'x', q: `${name} twitter`, match: (u: string) => /(twitter.com|x.com)/.test(u) },
  ];
  const out: Record<string, SearchResult> = {};
  for (const spec of specs) {
    const r = await searchCSE(spec.q, 3);
    const hit = r.find(x => spec.match(x.url));
    if (hit) out[spec.key] = hit;
  }
  const seen = new Set<string>();
  for (const key of Object.keys(out)) {
    const n = norm(out[key].url);
    if (seen.has(n)) delete out[key]; else seen.add(n);
  }
  return out;
}
