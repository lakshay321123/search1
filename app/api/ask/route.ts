import { metaSearch } from '@/lib/tools';
import { extractReadable } from '@/lib/fetcher/extract';
import { streamGeminiAnswer } from '@/lib/summarize/gemini';
import type { Focus, Style } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function enc(s: string) { return new TextEncoder().encode(s); }
function sse(write: (s: string)=>void) { return (o: any)=> write(`data: ${JSON.stringify(o)}\n\n`); }
function rid(){ /* @ts-ignore */ return (crypto?.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2); }

export async function POST(req: Request) {
  const { query, focus = 'all', style = 'simple' } = await req.json() as { query: string; focus?: Focus; style?: Style };

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));

      send({ event: 'status', msg: 'searching' });
      let results = await metaSearch(query, focus);

      // Emit source cards immediately (user can click while we synthesize)
      results.forEach((r, i) => send({ event: 'cite', cite: { id: String(i+1), url: r.url, title: r.title, snippet: r.snippet } }));

      // Optional: fetch + extract to enrich prompt later (not strictly needed when using Google Search tool)
      // const texts = await Promise.all(results.map(r => extractReadable(r.url)));

      send({ event: 'status', msg: 'summarizing' });
      for await (const ev of streamGeminiAnswer(query, results, style)) {
        if (ev.type === 'token') send({ event: 'token', text: ev.text });
        if (ev.type === 'final') {
          // If Gemini returned additional cites, merge/dedupe
          const merged = dedupeCites([
            ...results.map((r,i)=>({ id:String(i+1), url:r.url, title:r.title, snippet:r.snippet })),
            ...ev.cites
          ]);
          merged.forEach(c => send({ event: 'cite', cite: c }));
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites: merged, timeline: [], confidence: merged.length>=3?'high':(merged.length?'medium':'low') } });
        }
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive' } });
}

function dedupeCites(arr: {id?:string;url:string;title:string;snippet?:string}[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of arr) {
    try { const u=new URL(c.url); u.hash=''; u.search=''; const k=u.toString(); if(!seen.has(k)){ seen.add(k); out.push({ ...c }); } }
    catch { out.push(c); }
  }
  return out;
}
