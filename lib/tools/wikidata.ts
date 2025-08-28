// lib/tools/wikidata.ts
export type Socials = {
  website?: string;
  twitter?: string;
  x?: string; // same as twitter (x.com)
  instagram?: string;
  facebook?: string;
  linkedin?: string;
};

export async function getWikidataSocials(name: string): Promise<Socials> {
  try {
    // 1) find entity
    const search = new URL('https://www.wikidata.org/w/api.php');
    search.searchParams.set('action','wbsearchentities');
    search.searchParams.set('search', name);
    search.searchParams.set('language','en');
    search.searchParams.set('format','json');
    search.searchParams.set('limit','1');
    const r = await fetch(search.toString(), { cache: 'no-store' });
    if (!r.ok) return {};
    const j: any = await r.json();
    const id = j?.search?.[0]?.id;
    if (!id) return {};

    // 2) get claims
    const get = new URL('https://www.wikidata.org/w/api.php');
    get.searchParams.set('action','wbgetentities');
    get.searchParams.set('ids', id);
    get.searchParams.set('props','claims');
    get.searchParams.set('format','json');
    const rr = await fetch(get.toString(), { cache: 'no-store' });
    if (!rr.ok) return {};
    const jj: any = await rr.json();
    const claims = jj?.entities?.[id]?.claims || {};

    const out: Socials = {};
    const val = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value;

    // P856 official website
    const website = val('P856');
    if (website) out.website = typeof website === 'string' ? website : website?.url;

    // P2002 Twitter username
    const twitter = val('P2002');
    if (twitter) { out.twitter = `https://twitter.com/${twitter}`; out.x = `https://x.com/${twitter}`; }

    // P2003 Instagram username
    const ig = val('P2003');
    if (ig) out.instagram = `https://instagram.com/${ig}`;

    // P2013 Facebook ID/username (varies)
    const fb = val('P2013');
    if (fb) out.facebook = `https://facebook.com/${fb}`;

    // P6634 LinkedIn personal profile ID (often already a URL path)
    const liPerson = val('P6634');
    if (liPerson) {
      const s = String(liPerson);
      out.linkedin = s.startsWith('http') ? s : `https://www.linkedin.com/in/${s.replace(/^\/+/, '')}`;
    }

    // P4264 LinkedIn org ID (company pages)
    const liOrg = val('P4264');
    if (liOrg) out.linkedin = `https://www.linkedin.com/company/${liOrg}`;

    return out;
  } catch { return {}; }
}
