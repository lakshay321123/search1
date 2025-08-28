export type WikiProfile = {
  title: string;
  description?: string;
  extract?: string;
  pageUrl?: string;
  image?: string;
};

export type WikiCandidate = {
  title: string;
  description?: string;
  pageUrl: string;
  image?: string;
};

function wikiPageUrl(title: string) {
  const t = encodeURIComponent(title.replace(/\s/g, '_'));
  return `https://en.wikipedia.org/wiki/${t}`;
}

async function fetchSummaryByTitle(title: string): Promise<WikiProfile | null> {
  const t = encodeURIComponent(title);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${t}?redirect=true`;
  const r = await fetch(url, { next: { revalidate: 3600 } });
  if (!r.ok) return null;
  const j: any = await r.json();
  return {
    title: j.title,
    description: j.description,
    extract: j.extract,
    pageUrl: j.content_urls?.desktop?.page || wikiPageUrl(j.title),
    image: j.originalimage?.source || j.thumbnail?.source
  };
}

/** Find up to N candidates for a query (case-insensitive). */
export async function searchWikiCandidates(q: string, n = 6): Promise<WikiCandidate[]> {
  const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${n}&utf8=1&origin=*`;
  const r = await fetch(api, { cache: 'no-store' });
  if (!r.ok) return [];
  const j: any = await r.json();
  const titles: string[] = (j?.query?.search || []).map((s: any) => s.title);
  const enriched = await Promise.all(titles.map(async (t) => {
    const s = await fetchSummaryByTitle(t);
    return {
      title: t,
      description: s?.description,
      pageUrl: s?.pageUrl || wikiPageUrl(t),
      image: s?.image
    } as WikiCandidate;
  }));
  return enriched;
}

/** Get a rich primary profile (image + extract), with other candidates. */
export async function wikiDisambiguate(q: string): Promise<{ primary: WikiProfile | null; others: WikiCandidate[] }> {
  const cands = await searchWikiCandidates(q, 6);
  const primaryTitle = cands[0]?.title;
  const primary = primaryTitle ? await fetchSummaryByTitle(primaryTitle) : null;
  const others = cands.slice(1);
  return { primary, others };
}
