import type { Cite } from '../types';

type Hit = { url: string; title: string; snippet?: string };

const ID  = process.env.GOOGLE_CSE_ID || '';
const KEY = process.env.GOOGLE_CSE_KEY || '';

function ok() { return !!ID && !!KEY; }
const norm = (u:string)=>{ try{const x=new URL(u); x.hash=''; x.search=''; return x.toString();}catch{return u;} };

export async function searchCSE(query: string, num = 5): Promise<Hit[]> {
  if (!ok()) return [];
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  u.searchParams.set('q', query);
  u.searchParams.set('cx', ID);
  u.searchParams.set('key', KEY);
  u.searchParams.set('num', String(Math.min(10, Math.max(1, num))));
  const r = await fetch(u, { cache:'no-store' });
  if (!r.ok) return [];
  const j:any = await r.json();
  return (j.items || []).map((it:any)=>({ url:norm(it.link), title:it.title, snippet:it.snippet }));
}

export async function searchCSEMany(queries: string[], perQuery = 3): Promise<Hit[]> {
  if (!ok()) return [];
  const out:Hit[]=[]; const seen = new Set<string>();
  for (const q of queries) {
    const part = await searchCSE(q, perQuery);
    for (const h of part) {
      if (!seen.has(h.url)) { seen.add(h.url); out.push(h); }
      if (out.length>=12) break;
    }
    if (out.length>=12) break;
  }
  return out;
}

export function cseMissing(): boolean { return !ok(); }

export async function findSocialLinks(name: string) {
  const q = (site:string)=>searchCSE(`site:${site} ${name}`, 2);
  const [wiki, linkedin, insta, fb, x] = await Promise.all([
    q('wikipedia.org'), q('linkedin.com'), q('instagram.com'), q('facebook.com'),
    Promise.race([q('x.com'), q('twitter.com')])
  ]);
  const pick = (arr:Hit[]) => arr?.[0];
  return { wiki:pick(wiki), linkedin:pick(linkedin), insta:pick(insta), fb:pick(fb), x:pick(x) };
}

export function toCites(hits: Hit[], max = 10): Cite[] {
  const seen = new Set<string>(); const cites: Cite[] = [];
  for (const h of hits) {
    const u = norm(h.url);
    if (!seen.has(u)) { seen.add(u); cites.push({ id:String(cites.length+1), url:u, title:h.title, snippet:h.snippet }); }
    if (cites.length >= max) break;
  }
  return cites;
}

/** Build people candidates purely from CSE (for non-famous names). */
export async function peopleCandidatesFromCSE(name: string) {
  const base = await searchCSE(`"${name}"`, 8);
  const socials = await Promise.all([
    searchCSE(`site:linkedin.com/in "${name}"`, 4),
    searchCSE(`site:instagram.com "${name}"`, 4),
    searchCSE(`site:facebook.com "${name}"`, 4)
  ]);
  const hits = [...base, ...socials.flat()];
  const seen = new Set<string>();
  return hits
    .filter(h=>{ const u = norm(h.url); if (seen.has(u)) return false; seen.add(u); return true; })
    .map(h=>({
      title: h.title.replace(/\s*\|\s*LinkedIn.*$/i,'').replace(/\s*-\s*Instagram.*$/i,''),
      description: h.snippet, pageUrl: h.url
    }))
    .slice(0,8);
}
