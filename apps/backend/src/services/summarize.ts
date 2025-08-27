type Link = { url: string; title: string; snippet?: string };

export async function mockSummarize(query: string, links: Link[], style: 'simple'|'expert') {
  const intro = style === 'expert'
    ? `**Answer (Expert):** `
    : `**Answer:** `;
  const body = `Wizkid provides a sourced, concise summary to the query: "${query}". ` +
               `It streams tokens and shows citations that you can open.`;
  const tail = `\n\nKey points:\n- Citation-first answers.\n- Follow-ups supported.\n- Confidence badge.\n`;
  const text = intro + body + tail;
  const tokens = Array.from(text); // stream character by character for demo

  const cites = links.map((l, i) => ({
    id: String(i+1),
    url: l.url,
    title: l.title,
    snippet: l.snippet,
    published_at: undefined,
    quote: 'Example supporting quote (replace with real span).'
  }));

  return { tokens, cites };
}
