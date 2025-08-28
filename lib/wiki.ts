export type WikiProfile = { title: string; description?: string; extract?: string; pageUrl?: string; image?: string; };
export type WikiCandidate = { title: string; description?: string; pageUrl: string; image?: string; };

function wikiPageUrl(title: string) { const t = encodeURIComponent(title.replace(/\s/g, '_')); return `https://en.wikipedia.org/wiki/${t}`; }

async function fetchLeadImage(title: string): Promise<string | undefined> {
  try {
    const t = encodeURIComponent(title);
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/media/${t}`, { next: { revalidate: 3600 } });
    if (!r.ok) return;
    const j: any = await r.json();
    for (const it of j.items || []) {
      const src = it?.original?.source || it?.srcset?.[0]?.src || it?.thumbnail?.source;
      if (src?.startsWith('http')) return src;
    }
  } catch {}
}

async function fetchSummaryByTitle(title: string): Promise<WikiProfile | null> {
  const t = encodeURIComponent(title);
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${t}?redirect=true`, { next: { revalidate: 3600 } });
  if (!r.ok) return null;
  const j: any = await r.json();
  let image = j.originalimage?.source || j.thumbnail?.source || await fetchLeadImage(j.title);
  return { title: j.title, description: j.description, extract: j.extract, pageUrl: j.content_urls?.desktop?.page || wikiPageUrl(j.title), image };
}

const likelyPerson = (d?: string) => !!d && /born \d{4}|politician|singer|actor|cricketer|footballer|entrepreneur|businessman|author|journalist|activist|player/i.test(d);

export async function searchWikiCandidates(q: string, n = 6): Promise<WikiCandidate[]> {
  const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${n}&utf8=1&origin=*`;
  const r = await fetch(api, { cache: 'no-store' }); if (!r.ok) return [];
  const j: any = await r.json();
  const titles: string[] = (j?.query?.search || []).map((s: any) => s.title);
  const enriched = await Promise.all(titles.map(async (t) => {
    const s = await fetchSummaryByTitle(t);
    return { title: t, description: s?.description, pageUrl: s?.pageUrl || wikiPageUrl(t), image: s?.image } as WikiCandidate;
  }));
  return enriched.filter(c => likelyPerson(c.description));
}

export async function wikiDisambiguate(q: string): Promise<{ primary: WikiProfile | null; others: WikiCandidate[] }> {
  const cands = await searchWikiCandidates(q, 6);
  const primaryTitle = cands[0]?.title;
  const primary = primaryTitle ? await fetchSummaryByTitle(primaryTitle) : null;
  return { primary, others: cands.slice(1) };
}
