export async function wikiSuggest(q: string): Promise<string | null> {
  try {
    const u = new URL('https://en.wikipedia.org/w/api.php');
    u.searchParams.set('action','opensearch');
    u.searchParams.set('search', q);
    u.searchParams.set('limit','1');
    u.searchParams.set('namespace','0');
    u.searchParams.set('format','json');
    u.searchParams.set('origin','*');
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) return null;
    const j: any = await r.json();
    const best: string | undefined = j?.[1]?.[0];
    if (best && best.toLowerCase() !== q.toLowerCase()) return best;
    return null;
  } catch { return null; }
}
