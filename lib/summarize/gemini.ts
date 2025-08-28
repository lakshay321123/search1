import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SearchResult, Cite, Style } from '../types';

export async function* streamGeminiAnswer(query: string, sources: SearchResult[], style: Style) {
  const apiKey = process.env.GEMINI_API_KEY!;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', tools: [{ googleSearch: {} } as any] });

  const sourceList = sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n');
  const sys = `You are Wizkid, a neutral research assistant.\nAlways cite inline like [n]. Prefer official/primary sources. Style: ${style}.`;
  const prompt = `${sys}\n\nQuestion: ${query}\n\nKnown sources (may use more via Google Search tool):\n${sourceList}`;

  const resp = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  for await (const ev of resp.stream) {
    const t = (ev as any).text?.();
    if (t) yield { type: 'token', text: t } as const;
  }

  try {
    const full = (await resp.response) as any;
    const cand = full?.candidates?.[0];
    const gm = cand?.groundingMetadata;
    const chunks = gm?.groundingChunks || [];
    const cites: Cite[] = chunks
      .map((g: any, i: number) => {
        const uri = g?.web?.uri || g?.retrievedContext?.uri;
        const title = g?.web?.title || uri || `Source ${i + 1}`;
        return uri ? { id: String(i + 1), url: uri, title } : null;
      })
      .filter(Boolean) as Cite[];
    yield { type: 'final', cites } as const;
  } catch {
    yield { type: 'final', cites: [] } as const;
  }
}
