export async function getWikidataSocials(label: string) {
  try {
    const s = new URL('https://www.wikidata.org/w/api.php');
    s.searchParams.set('action','wbsearchentities'); s.searchParams.set('search', label); s.searchParams.set('language','en'); s.searchParams.set('format','json'); s.searchParams.set('limit','1'); s.searchParams.set('origin','*');
    const sr = await fetch(s, { cache:'no-store' }); const sj:any = await sr.json(); const id:string|undefined = sj?.search?.[0]?.id; if (!id) return {};
    const d = new URL('https://www.wikidata.org/w/api.php');
    d.searchParams.set('action','wbgetentities'); d.searchParams.set('ids', id); d.searchParams.set('props','claims'); d.searchParams.set('format','json'); d.searchParams.set('origin','*');
    const dr = await fetch(d, { cache:'no-store' }); const dj:any = await dr.json(); const cl = dj?.entities?.[id]?.claims || {};
    const getStr = (pid:string) => { const v = cl[pid]?.[0]?.mainsnak?.datavalue?.value; return typeof v === 'string' ? v : (v?.text || v?.id || ''); };
    const website = getStr('P856'), twitter=getStr('P2002'), instagram=getStr('P2003'), facebook=getStr('P2013'), linkedinId=getStr('P6634');
    const out:any = {}; if (website) out.website=website; if (linkedinId) out.linkedin=`https://www.linkedin.com/in/${linkedinId}`; if (instagram) out.instagram=`https://www.instagram.com/${instagram}`; if (facebook) out.facebook=`https://www.facebook.com/${facebook}`; if (twitter) out.x=`https://x.com/${twitter}`; return out;
  } catch { return {}; }
}
