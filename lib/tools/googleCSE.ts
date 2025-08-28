import type { SearchResult } from '../../lib/types';

function domainOf(u: string) { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } }
function norm(u: string) { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } }

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
    const u = norm(it.link);
    if (seen.has(u)) continue; seen.add(u);
    out.push({ title: it.title, url: u, snippet: it.snippet, domain: domainOf(u) });
  }
  return out;
}

export async function searchCSEMany(queries: string[], perQuery = 3) {
  const batches = await Promise.all(queries.map(q => searchCSE(q, perQuery)));
  const seen = new Set<string>(); const out: SearchResult[] = [];
  for (const arr of batches) for (const r of arr) {
    const k = norm(r.url); if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

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
  const byHost = (host: string) => flat.find(r => (r.domain || '').endsWith(host));
  // Prefer /in/ profiles on LinkedIn
  const linkedin = flat
    .filter(r => (r.domain || '').endsWith('linkedin.com'))
    .sort((a,b) => scoreLinkedIn(b.url, person) - scoreLinkedIn(a.url, person))[0];
  return {
    wiki: byHost('wikipedia.org'),
    linkedin,
    insta: byHost('instagram.com'),
    fb: byHost('facebook.com'),
    x: byHost('x.com') || byHost('twitter.com'),
    all: flat
  };
}

function scoreLinkedIn(url: string, name: string) {
  const u = url.toLowerCase(), n = name.toLowerCase().replace(/\s+/g,'');
  return (u.includes('/in/') ? 5 : 0) + (u.includes('/company/') ? 2 : 0) + (u.includes(n) ? 2 : 0) + 1;
}

