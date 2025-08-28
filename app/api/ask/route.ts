// app/api/ask/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';

interface AskRequest { query: string; style?: 'simple' | 'expert'; }

function enc(s: string) { return new TextEncoder().encode(s); }
function sse(write: (s: string) => void) {
  return (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
}
function rid() {
  // @ts-ignore
  return (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2);
}

export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json() as AskRequest;

  const searchKey = process.env.SEARCH_API_KEY;
  const llmKey = process.env.LLM_API_KEY;
  if (!searchKey) {
    return new Response('Missing SEARCH_API_KEY in environment', { status: 500 });
  }
  if (!llmKey) {
    return new Response('Missing LLM_API_KEY in environment', { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        send({ event: 'token', text: '**GEMINI_API_KEY missing**' });
        send({ event: 'final', snapshot: { id: rid(), markdown: 'Missing key', cites: [], timeline: [], confidence: 'low' } });
        controller.close();
        return;
      }

      send({ event: 'status', msg: 'searching (Gemini + Google Search)' });

      const genAI = new GoogleGenerativeAI(apiKey);
      // Enable Google Search tool (Gemini will search + return citations)
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        // Cast to any to allow googleSearch tool until types are available
        tools: [{ googleSearch: {} }] as any
      });

      const sys = `You are Wizkid, a concise, citation-first assistant.
Use inline [n] citations; prefer official/primary sources.
Style: ${style === 'expert' ? 'Expert (lawyer-grade)' : 'Simple'}.`;

      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: `${sys}\n\nQuestion: ${query}` }] }]
      });

      let finalResponse: any = null;

      for await (const event of result.stream) {
        // Each event can be turned into text
        const text = (event as any).text?.();
        if (text) send({ event: 'token', text });
        finalResponse = event; // keep last for metadata
      }

      // Try to gather citations from grounding metadata
      let cites: any[] = [];
      try {
        const full = await result.response;
        const cand = (full as any)?.candidates?.[0];
        const gm = cand?.groundingMetadata;
        const chunks = gm?.groundingChunks || [];
        cites = chunks.map((g: any, i: number) => {
          const uri = g?.web?.uri || g?.retrievedContext?.uri;
          const title = g?.web?.title || uri || `Source ${i + 1}`;
          return uri ? { id: String(i + 1), url: uri, title } : null;
        }).filter(Boolean);
      } catch { /* ignore if missing */ }

      // Emit source cards
      for (const c of cites) send({ event: 'cite', cite: c });

      send({
        event: 'final',
        snapshot: {
          id: rid(),
          markdown: '(streamed)',
          cites,
          timeline: [],
          confidence: cites.length >= 3 ? 'high' : (cites.length ? 'medium' : 'low')
        }
      });

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}
