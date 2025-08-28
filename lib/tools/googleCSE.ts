// lib/tools/googleCSE.ts
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

/** Try to find official social links via CSE (Wiki, LinkedIn, Instagram, Facebook, X). */
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
  const batches = await Promise.all(queries.map(q => searchCSE(q, 4)));
  const flat = batches.flat();

  const pickHost = (host: string) => flat.find(r => r.domain.endsWith(host));

  // Prefer personal profile URLs on LinkedIn
  const linkedinBest = flat
    .filter(r => r.domain.endsWith('linkedin.com'))
    .sort((a, b) => scoreLinkedIn(b.url, person) - scoreLinkedIn(a.url, person))[0];

  const wiki = pickHost('wikipedia.org');
  const insta = pickHost('instagram.com');
  const fb = pickHost('facebook.com');
  const x = pickHost('x.com') || pickHost('twitter.com');

  return { wiki, linkedin: linkedinBest, insta, fb, x, all: flat };
}

function scoreLinkedIn(url: string, name: string) {
  const u = url.toLowerCase();
  const n = name.toLowerCase().replace(/\s+/g, '');
  let s = 0;
  if (u.includes('/in/')) s += 5;             // person profile
  if (u.includes('/company/')) s += 2;        // org
  if (u.includes(n)) s += 2;                  // name match
  if (u.includes('linkedin.com')) s += 1;
  return s;
}
