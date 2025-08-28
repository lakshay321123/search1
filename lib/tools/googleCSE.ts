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

/** Try to find official/socials using site filters (LinkedIn/Instagram/Facebook/X/Wikipedia). */
export async function findSocialLinks(name: string) {
  const q = (site: string) => searchCSE(`site:${site} ${name}`, 2);
  const [wiki, linkedin, insta, fb, x] = await Promise.all([
    q('wikipedia.org'), q('linkedin.com'), q('instagram.com'), q('facebook.com'), Promise.race([q('x.com'), q('twitter.com')]),
  ]);
  const pick = (arr: Hit[]) => arr?.[0];
  return {
    wiki: pick(wiki),
    linkedin: pick(linkedin),
    insta: pick(insta),
    fb: pick(fb),
    x: pick(x)
  };
}
