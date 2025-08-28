export type WikiProfile = { title: string; description?: string; extract?: string; pageUrl?: string; image?: string; };
export type WikiCandidate = { title: string; description?: string; pageUrl: string; image?: string; };

function wikiPageUrl(title: string) {
  const t = encodeURIComponent(title.replace(/\s/g, '_'));
  return `https://en.wikipedia.org/wiki/${t}`;
}
async function fetchSummaryByTitle(title: string): Promise<WikiProfile | null> {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, { next:{ revalidate:3600 } });
  if (!r.ok) return null;
  const j:any = await r.json();
  return { title: j.title, description: j.description, extract: j.extract, pageUrl: j.content_urls?.desktop?.page || wikiPageUrl(j.title), image: j.originalimage?.source || j.thumbnail?.source };
}
export async function searchWikiCandidates(q: string, n = 6): Promise<WikiCandidate[]> {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${n}&utf8=1&origin=*`, { cache:'no-store' });
  if (!r.ok) return [];
  const j:any = await r.json();
  const titles: string[] = (j?.query?.search || []).map((s:any)=>s.title);
  return (await Promise.all(titles.map(async t => {
    const s = await fetchSummaryByTitle(t);
    return { title:t, description:s?.description, pageUrl:s?.pageUrl || wikiPageUrl(t), image:s?.image } as WikiCandidate;
  })));
}
export async function wikiDisambiguate(q: string): Promise<{ primary: WikiProfile | null; others: WikiCandidate[] }> {
  const cands = await searchWikiCandidates(q, 6);
  const primaryTitle = cands[0]?.title;
  const primary = primaryTitle ? await fetchSummaryByTitle(primaryTitle) : null;
  return { primary, others: cands.slice(1) };
}
