// Sum last ~60 days of pageviews for an enwiki title; higher = more famous.
export async function wikiPageviews60d(title: string): Promise<number> {
  try {
    const t = encodeURIComponent(title.replace(/\s/g, '_'));
    // Last 60 days (buffered).
    const now = new Date();
    const end = now.toISOString().slice(0,10).replace(/-/g,'');
    const startDate = new Date(now.getTime() - 60*24*3600*1000);
    const start = startDate.toISOString().slice(0,10).replace(/-/g,'');
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${t}/daily/${start}/${end}`;
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return 0;
    const j: any = await r.json();
    const items = j.items || [];
    return items.reduce((sum: number, x: any) => sum + (x.views || 0), 0);
  } catch { return 0; }
}
