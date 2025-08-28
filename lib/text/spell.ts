export async function suggest(query: string): Promise<string[]> {
  try {
    const url = `https://api.datamuse.com/sug?s=${encodeURIComponent(query)}&max=5`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return [];
    const j: any[] = await r.json();
    return j.map(x => x.word).filter(Boolean);
  } catch {
    return [];
  }
}
