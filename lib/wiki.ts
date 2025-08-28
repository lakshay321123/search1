export interface WikiCandidate {
  title: string;
  description?: string;
  pageUrl?: string;
  image?: string;
}

export interface WikiProfile extends WikiCandidate { extract?: string; }

async function wikiSummary(title: string): Promise<WikiProfile | null> {
  try {
    const slug = title.replace(/\s/g, '_');
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`);
    if (!r.ok) return null;
    const d: any = await r.json();
    return {
      title: d.title,
      description: d.description || d.extract, // description short
      pageUrl: `https://en.wikipedia.org/wiki/${slug}`,
      image: d.originalimage?.source || d.thumbnail?.source,
      extract: d.extract,
    };
  } catch {
    return null;
  }
}

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
      pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/\s/g, '_'))}`,
    });

    const [first, ...rest] = results;
    const primary = (await wikiSummary(first.title)) || { ...mk(first) };
    const others: WikiCandidate[] = [];
    for (const r of rest) {
      const prof = await wikiSummary(r.title);
      others.push(prof ? prof : mk(r));
    }
    return { primary, others };
  } catch {
    return { others: [] };
  }
}

export { wikiSummary };
