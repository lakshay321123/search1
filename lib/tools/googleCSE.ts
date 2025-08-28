import type { SearchResult } from '../types';

function domainOf(u: string) { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } }
function normalize(u: string) { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } }

export async function searchCSE(q: string, num = 6): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=${num}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return [];
  const j: any = await r.json();
  const items: any[] = j.items || [];
  const seen = new Set<string>(); const out: SearchResult[] = [];
  for (const it of items.slice(0, num)) {
    const url = normalize(it.link);
    if (seen.has(url)) continue; seen.add(url);
    out.push({ title: it.title, url, snippet: it.snippet, domain: domainOf(url) });
  }
  return out;
}

export async function findSocialLinks(name: string) {
  const qs = [
    `site:wikipedia.org ${name}`,
    `site:instagram.com ${name}`,
    `site:facebook.com ${name}`,
    `site:x.com ${name}`, `site:twitter.com ${name}`
  ];
  const batches = await Promise.all(qs.map(q => searchCSE(q, 3)));
  const flat = batches.flat();
  const pick = (host: string) => flat.find(r => r.domain.endsWith(host));
  const wiki = pick('wikipedia.org');
  const insta = pick('instagram.com');
  const fb = pick('facebook.com');
  const x = pick('x.com') || pick('twitter.com');
  return { wiki, insta, fb, x, all: flat };
}

