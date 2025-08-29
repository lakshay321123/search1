import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Source = { title: string; url: string };
type SummarizeOpts = {
  subject: string;
  sources: Source[];
  style?: "simple" | "expert";
};

function numberedList(sources: Source[]) {
  return sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join("\n");
}

export async function summarizeWithCitations(opts: SummarizeOpts): Promise<string> {
  const { subject, sources, style = "simple" } = opts;
  const list = numberedList(sources);

  const sys = `You are Wizkid, a neutral, citation-first assistant.
Write a concise answer in <= 200 words. Add [n] citations that refer to the numbered sources.
No speculation. Prefer official or high-quality sources. Style: ${style}.`;

  const user = `Subject/Query: ${subject}

Numbered sources:
${list || "(none)"}

Instructions:
- Start with the most important fact/conclusion.
- Each claim that comes from a source must include an inline [n] citation.
- If there are no sources, say so briefly and suggest a better query.`;

  // Prefer OpenAI if available
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  if (!hasOpenAI && !hasGemini) {
    // Nothing to call; return a graceful hint
    return `I don't have access to a language model right now. Please add OPENAI_API_KEY or GEMINI_API_KEY in Vercel.`;
  }

  if (hasOpenAI) {
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: sys },
        { role: "user", content: user }
      ];
      const r = await client.chat.completions.create({
        model,
        temperature: 0.2,
        messages
      });
      const text = (r.choices?.[0]?.message?.content || "").trim();
      if (text) return text;
    } catch (e: any) {
      // fall through to Gemini
    }
  }

  if (hasGemini) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      // small, cheap + stable
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      const res = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `${sys}\n\n${user}` }]}]
      });
      const text =
        res.response?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ||
        res.response?.text() ||
        "";
      if (text?.trim()) return text.trim();
    } catch (e: any) {
      // no provider worked
    }
  }

  return `LLM temporarily unavailable or rate-limited. Showing sources above. Try again in a minute.`;
}

export function relatedSuggestions(nameOrQuery: string) {
  const n = nameOrQuery;
  return [
    { label: "Overview",     prompt: `Give a concise overview of ${n}.` },
    { label: "Pros & cons",  prompt: `What are the pros and cons of ${n}?` },
    { label: "How-to",       prompt: `How do I get started with ${n}?` },
    { label: "Alternatives", prompt: `What are the top alternatives to ${n}?` },
    { label: "Deeper dive",  prompt: `Explain ${n} in depth with sources.` }
  ];
}
