export interface WikiPage {
  title: string;
  description: string;
  extract?: string;
  image?: string;
  pageUrl: string;
}

export async function wikiDisambiguate(query: string): Promise<{ primary?: WikiPage; others: WikiPage[] }> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (!res.ok) return { primary: undefined, others: [] };
    const data = await res.json();
    const primary: WikiPage = {
      title: data.title,
      description: data.description || '',
      extract: data.extract,
      image: data.thumbnail?.source,
      pageUrl: data.content_urls?.desktop?.page || ''
    };
    return { primary, others: [] };
  } catch {
    return { primary: undefined, others: [] };
  }
}
