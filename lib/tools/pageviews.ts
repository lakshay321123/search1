export async function wikiPageviews60d(titleOrSlug: string): Promise<number> {
  try {
    const slug = encodeURIComponent(titleOrSlug.replace(/\s/g,'_'));
    const now = new Date();
    const end = now.toISOString().slice(0,10).replace(/-/g,'');
    const start = new Date(now.getTime() - 60*24*3600*1000).toISOString().slice(0,10).replace(/-/g,'');
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${slug}/daily/${start}/${end}`;
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return 0;
    const j: any = await r.json();
    return (j.items || []).reduce((s:number,x:any)=>s+(x.views||0),0);
  } catch { return 0; }
}
