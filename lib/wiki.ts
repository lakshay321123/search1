export interface WikiProfile {
  title: string;
  description?: string;
  extract: string;
  url: string;
  leadImage?: string;
}

export interface WikiCandidate {
  title: string;
  description?: string;
  url: string;
  leadImage?: string;
}

export function wikiPageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

const CACHE_REVALIDATE = 60 * 60 * 24; // one day

export async function fetchLeadImage(title: string): Promise<string | undefined> {
  const mediaUrl = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(mediaUrl, { next: { revalidate: CACHE_REVALIDATE } });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.type === 'image') {
          if (item.srcset && item.srcset.length) return item.srcset[0].src;
          if (item.original && item.original.source) return item.original.source;
          if (item.src) return item.src;
        }
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function fetchSummaryByTitle(title: string): Promise<WikiProfile | undefined> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { next: { revalidate: CACHE_REVALIDATE } });
    if (!res.ok) return undefined;
    const data = await res.json();
    const leadImage = data.originalimage?.source || data.thumbnail?.source || await fetchLeadImage(data.title || title);
    return {
      title: data.title,
      description: data.description,
      extract: data.extract,
      url: data.content_urls?.desktop?.page || wikiPageUrl(data.title),
      leadImage,
    };
  } catch {
    return undefined;
  }
}

export async function searchWikiCandidates(query: string, limit = 5): Promise<WikiCandidate[]> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetch(url, { next: { revalidate: CACHE_REVALIDATE } });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const results: WikiCandidate[] = [];
    for (const page of pages) {
      const title: string = page.title;
      const leadImage = page.thumbnail?.url || await fetchLeadImage(title);
      results.push({
        title,
        description: page.description,
        url: wikiPageUrl(title),
        leadImage,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function wikiDisambiguate(query: string): Promise<WikiProfile | undefined> {
  const primary = await fetchSummaryByTitle(query);
  if (!primary) return undefined;
  if (!/disambiguation/i.test(primary.description ?? '') && !/may refer to/i.test(primary.extract)) {
    return primary;
  }
  const candidates = await searchWikiCandidates(query);
  for (const c of candidates) {
    const profile = await fetchSummaryByTitle(c.title);
    if (profile && !/disambiguation/i.test(profile.description ?? '') && !/may refer to/i.test(profile.extract)) {
      return profile;
    }
  }
  return primary;
}

