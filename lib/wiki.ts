export type WikiProfile = { title: string; description?: string; extract?: string; pageUrl?: string; image?: string };

export async function fetchWikiProfile(q: string): Promise<WikiProfile | null> {
  const t = encodeURIComponent(q.trim());
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${t}?redirect=true`;
  const r = await fetch(url, { next: { revalidate: 3600 } });
  if (!r.ok) return null;
  const j: any = await r.json();
  return {
    title: j.title,
    description: j.description,
    extract: j.extract,
    pageUrl: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${t}`,
    image: j.originalimage?.source || j.thumbnail?.source
  };
}

