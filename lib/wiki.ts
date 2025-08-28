export interface WikiCandidate {
  title: string;
  description?: string;
  pageUrl?: string;
  image?: string;
}

export interface WikiProfile extends WikiCandidate {}

export async function wikiDisambiguate(q: string): Promise<{ primary?: WikiProfile; others: WikiCandidate[] }> {
  try {
    const search = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json`);
    if (!search.ok) return { others: [] };
    const data: any = await search.json();
    const results = data.query?.search || [];
    if (!results.length) return { others: [] };
    const mk = (r: any): WikiCandidate => ({
      title: r.title,
      description: r.snippet?.replace(/<[^>]+>/g, ''),
      pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/\s/g, '_'))}`
    });
    const primary = mk(results[0]);
    const others = results.slice(1).map(mk);
    return { primary, others };
  } catch {
    return { others: [] };
  }
}
