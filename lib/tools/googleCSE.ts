import type { SearchResult } from '../types';

function domainOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; }
}

export async function searchCSE(q: string, num = 6): Promise<SearchResult[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=${num}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return [];
  const j: any = await r.json();
  const items: any[] = j.items || [];
  const out = items.slice(0, num).map((it: any) => ({
    title: it.title,
    url: it.link,
    snippet: it.snippet,
    domain: domainOf(it.link)
  }));
  // dedupe by URL sans query/hash
  const seen = new Set<string>();
  return out.filter(x => {
    try { const u = new URL(x.url); u.hash=''; u.search=''; const k=u.toString();
      if (seen.has(k)) return false; seen.add(k); return true;
    } catch { return true; }
  });
}

export async function findSocialLinks(name: string) {
  const queries = [
    `site:wikipedia.org ${name}`,
    `site:instagram.com ${name}`,
    `site:facebook.com ${name}`,
    `site:x.com ${name}`,
    `site:twitter.com ${name}`
  ];
  const batches = await Promise.all(queries.map(q => searchCSE(q, 3)));
  const flat = batches.flat();

  // pick one best link per site
  const pick = (host: string) => flat.find(r => r.domain.endsWith(host));
  const wiki = pick('wikipedia.org');
  const insta = pick('instagram.com');
  const fb = pick('facebook.com');
  const x = pick('x.com') || pick('twitter.com');

  return { wiki, insta, fb, x, all: flat };
}
