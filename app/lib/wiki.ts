export interface WikiPage {
  title: string;
  extract: string;
  url: string;
}

export async function wikiDisambiguate(query: string): Promise<WikiPage[]> {
  const api = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=&explaintext=&redirects=1&titles=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(api);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    return Object.values(pages).map((p: any) => ({
      title: p.title,
      extract: p.extract || '',
      url: `https://en.wikipedia.org/?curid=${p.pageid}`,
    }));
  } catch {
    return [];
  }
}
