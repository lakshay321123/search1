import { searchCSE } from '../tools/googleCSE';
import { fetchOpenGraph } from '../tools/opengraph';

export type CSERawCand = { name: string; url: string; image?: string; source: 'linkedin'|'instagram'|'facebook'|'x'|'twitter'|'web' };

function extractNameFromTitle(title: string): string {
  // Common patterns: "Name - Title | LinkedIn", "Name | LinkedIn", "Name (@handle) • Instagram"
  const t = title.replace(/\u2013|\u2014/g, '-');
  const ig = t.match(/^(.+?)\s*\(@/i);
  if (ig) return ig[1].trim();
  const li = t.match(/^(.+?)[\-|–]/);
  if (li) return li[1].trim();
  return t.replace(/\s*\|\s*LinkedIn/i, '').replace(/\s*•\s*Instagram/i, '').trim();
}

export async function csePeopleCandidates(q: string, perHost = 4): Promise<CSERawCand[]> {
  const queries = [
    `site:linkedin.com/in "${q}"`,
    `site:instagram.com "${q}"`,
    `site:facebook.com "${q}"`,
    `site:x.com "${q}"`,
    `site:twitter.com "${q}"`
  ];
  const flat = (await Promise.all(queries.map(x => searchCSE(x, perHost)))).flat();

  const out: CSERawCand[] = [];
  for (const r of flat) {
    const host = (r.domain || '').toLowerCase();
    let source: CSERawCand['source'] = 'web';
    if (host.endsWith('linkedin.com') && /\/in\//.test(r.url)) source = 'linkedin';
    else if (host.endsWith('instagram.com')) source = 'instagram';
    else if (host.endsWith('facebook.com')) source = 'facebook';
    else if (host.endsWith('x.com') || host.endsWith('twitter.com')) source = 'x';

    const name = extractNameFromTitle(r.title || '');
    const cand: CSERawCand = { name: name || q, url: r.url, source };

    // Try OG image for nicer chips
    try {
      if (!cand.image) cand.image = (await fetchOpenGraph(r.url))?.image;
    } catch {}
    out.push(cand);
  }
  return out;
}
