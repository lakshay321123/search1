type Hit = { url: string; title: string; snippet?: string };

const ID  = process.env.GOOGLE_CSE_ID || '';
const KEY = process.env.GOOGLE_CSE_KEY || '';

function ok() { return !!ID && !!KEY; }

export async function searchCSE(query: string, num = 5): Promise<Hit[]> {
  if (!ok()) return [];
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.searchParams.set('q', query);
  u.searchParams.set('cx', ID);
  u.searchParams.set('key', KEY);
  u.searchParams.set('num', String(Math.min(10, Math.max(1, num))));
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j.items || []).map((it: any) => ({
    url: it.link, title: it.title, snippet: it.snippet
  }));
}

export async function searchCSEMany(queries: string[], perQuery = 3): Promise<Hit[]> {
  if (!ok()) return [];
  const results: Hit[] = [];
  for (const q of queries) {
    const part = await searchCSE(q, perQuery);
    for (const h of part) {
      if (!results.some(x => x.url === h.url)) results.push(h);
      if (results.length >= 12) break;
    }
    if (results.length >= 12) break;
  }
  return results;
}

export function cseMissing(): boolean { return !ok(); }

/** Try to find official social links via CSE (Wiki, LinkedIn, Instagram, Facebook, X/Twitter). */
export async function findSocialLinks(name: string) {
  const person = name.trim();
  const queries = [
    `site:wikipedia.org "${person}"`,
    `site:linkedin.com "${person}"`,
    `site:instagram.com "${person}"`,
    `site:facebook.com "${person}"`,
    `site:x.com "${person}"`,
    `site:twitter.com "${person}"`
  ];
  const flat = (await Promise.all(queries.map(q => searchCSE(q, 4)))).flat();
  const byHost = (host: string) => flat.find(r => { try { return new URL(r.url).hostname.endsWith(host); } catch { return false; } });
  const filterHost = (host: string) => flat.filter(r => { try { return new URL(r.url).hostname.endsWith(host); } catch { return false; } });
  const linkedin = filterHost('linkedin.com').sort((a,b)=>scoreLinkedIn(b.url, person) - scoreLinkedIn(a.url, person))[0];
  return { wiki: byHost('wikipedia.org'), linkedin, insta: byHost('instagram.com'), fb: byHost('facebook.com'),
           x: byHost('x.com') || byHost('twitter.com'), all: flat };
}

function scoreLinkedIn(url: string, name: string) {
  const u = url.toLowerCase(), n = name.toLowerCase().replace(/\s+/g,'');
  return (u.includes('/in/') ? 5 : 0) + (u.includes('/company/') ? 2 : 0) + (u.includes(n) ? 2 : 0) + 1;
}
