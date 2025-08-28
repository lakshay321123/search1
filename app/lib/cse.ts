export interface CSEItem {
  id: string;
  title: string;
  snippet: string;
  url: string;
}

export async function googleCSE(query: string): Promise<CSEItem[]> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  const api = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(api);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items ?? [];
    return items.map((item: any, idx: number) => ({
      id: String(idx + 1),
      title: item.title,
      snippet: item.snippet || '',
      url: item.link,
    }));
  } catch {
    return [];
  }
}
