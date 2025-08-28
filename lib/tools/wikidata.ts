export type Socials = { website?: string; twitter?: string; x?: string; instagram?: string; facebook?: string; linkedin?: string; };

export async function getWikidataSocials(name: string): Promise<Socials> {
  try {
    const q = new URL('https://www.wikidata.org/w/api.php');
    q.searchParams.set('action','wbsearchentities'); q.searchParams.set('search', name);
    q.searchParams.set('language','en'); q.searchParams.set('format','json'); q.searchParams.set('limit','1');
    const r = await fetch(q, { cache: 'no-store' }); if (!r.ok) return {}; const j: any = await r.json();
    const id = j?.search?.[0]?.id; if (!id) return {};
    const g = new URL('https://www.wikidata.org/w/api.php');
    g.searchParams.set('action','wbgetentities'); g.searchParams.set('ids', id);
    g.searchParams.set('props','claims'); g.searchParams.set('format','json');
    const rr = await fetch(g, { cache: 'no-store' }); if (!rr.ok) return {}; const jj: any = await rr.json();
    const claims = jj?.entities?.[id]?.claims || {};
    const val = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value;

    const out: Socials = {};
    const web = val('P856'); if (web) out.website = typeof web === 'string' ? web : web?.url;
    const tw = val('P2002'); if (tw) { out.twitter = `https://twitter.com/${tw}`; out.x = `https://x.com/${tw}`; }
    const ig = val('P2003'); if (ig) out.instagram = `https://instagram.com/${ig}`;
    const fb = val('P2013'); if (fb) out.facebook = `https://facebook.com/${fb}`;
    const liPerson = val('P6634'); if (liPerson) out.linkedin = String(liPerson).startsWith('http') ? String(liPerson) : `https://www.linkedin.com/in/${String(liPerson).replace(/^\/+/, '')}`;
    const liOrg = val('P4264'); if (liOrg) out.linkedin = `https://www.linkedin.com/company/${liOrg}`;
    return out;
  } catch { return {}; }
}

