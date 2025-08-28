// app/api/ask/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { wikiDisambiguate } from '../../lib/wiki';
import { googleCSE } from '../../lib/cse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AskRequest {
  query: string;
  style?: 'simple' | 'expert';
}

interface Candidate {
  id: string;
  title: string;
  url: string;
  snippet: string;
  extract?: string;
}

function enc(s: string) {
  return new TextEncoder().encode(s);
}

function sse(write: (s: string) => void) {
  return (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
}

function rid() {
  // @ts-ignore
  return (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
    Math.random().toString(36).slice(2);
}

export async function POST(req: Request): Promise<Response> {
  const { query, style } = await req.json() as AskRequest;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));
      try {
        const wikiPages = await wikiDisambiguate(query);
        const cseResults = await googleCSE(query);
        const sources: Candidate[] = cseResults.length
          ? cseResults
          : wikiPages.map((p, idx) => ({
              id: String(idx + 1),
              title: p.title,
              url: p.url,
              snippet: p.extract,
              extract: p.extract,
            }));

        send({ event: 'candidates', candidates: sources.map(({ id, title, url }) => ({ id, title, url })) });
        send({ event: 'profile', profile: { style: style ?? 'simple' } });
        send({ event: 'related', related: sources.slice(1).map(({ title, url }) => ({ title, url })) });
        for (const s of sources) {
          send({ event: 'cite', cite: { id: s.id, url: s.url, title: s.title } });
        }

        const info = sources.map((s) => `${s.title}: ${s.snippet}`).join('\n\n');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `Use the following information to answer the question: ${query}\n${info}`;
        const generation = await model.generateContentStream({
          contents: [{ role: 'user', parts: [{ text: prompt }]}],
        });
        let accumulated = '';
        for await (const chunk of generation.stream) {
          const text = chunk.text();
          if (text) {
            accumulated += text;
            send({ event: 'token', text });
          }
        }
        const result = await generation.response;
        let finalText = result.text() || '';
        if (!finalText.trim()) {
          const fallback = wikiPages[0]?.extract?.slice(0, 400).trim();
          if (fallback) finalText = fallback;
        }
        send({
          event: 'final',
          snapshot: {
            id: rid(),
            markdown: finalText.trim(),
            cites: sources.map((s) => ({ id: s.id, url: s.url, title: s.title })),
            timeline: [],
            confidence: 'medium',
          },
        });
      } catch (err: any) {
        send({ event: 'status', msg: `error: ${err.message}` });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
