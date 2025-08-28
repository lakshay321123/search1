import { generateText } from "./provider";

export async function summarizeWithCitations(opts: {
  subject: string;
  sources: { title: string; url: string }[];
  style?: "simple" | "expert";
}): Promise<string> {
  const system = `You are Wizkid. Write a concise answer in ≤200 words.
- Use inline [n] citations that match the numbered list provided.
- No speculation; only use the listed sources.
- Tone: ${opts.style === "expert" ? "Expert" : "Simple"}.`;

  const sourceList = opts.sources.map((s, i) => `[${i+1}] ${s.title} — ${s.url}`).join("\n");
  const prompt = `${system}

Subject/Query: ${opts.subject}

Numbered sources:
${sourceList}`;

  return generateText({ prompt, system });
}

export async function expandQueries(query: string): Promise<string[]> {
  const system = "You are a helpful search strategist.";
  const prompt = `Rewrite and expand the user query for web search. 
Return 4–6 short diverse queries, one per line, no numbering.
User query: ${query}`;
  const text = await generateText({ prompt, system });
  return text.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,6);
}

export async function relatedSuggestions(subject: string): Promise<{label:string; prompt:string}[]> {
  const system = "You generate follow-up questions that are actionable for search.";
  const prompt = `Generate 5 concise follow-up questions (≤8 words each) about: ${subject}.
Return as lines: label | full prompt`;
  const text = await generateText({ prompt, system });
  const lines = text.split("\n").map(s=>s.trim()).filter(Boolean);
  const items = lines.map(l=>{
    const [label, rest] = l.split("|");
    const clean = (s?:string)=> (s||"").trim();
    return { label: clean(label), prompt: clean(rest||label) };
  }).filter(x=>x.label);
  return items.slice(0,5);
}
