export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { planAndFetch } from '../../../lib/think/orchestrator';
import { summarizeWithCitations, relatedSuggestions } from '../../../lib/llm/tasks';
import { ipLocate } from '../../../lib/geo/ip';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
async function streamPlain(send:(o:any)=>void, text:string){ if (!text) return; for (const ch of (text.match(/.{1,110}(\s|$)/g) || [text])) send({event:'token', text: ch}); }

type Req = { query: string; coords?: { lat:number, lon:number } };

export async function POST(req: Request) {
  const { query, coords } = await req.json() as Req;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));
      try {
        if (!query?.trim()) { send({event:'final', snapshot:{ id: rid(), markdown:'(empty query)', cites:[], timeline:[], confidence:'low' }}); controller.close(); return; }

        // 1) First attempt with whatever coords we got
        let plan = await planAndFetch(query, coords);

        // 2) If it needed location, fallback to IP automatically
        if (plan.plan?.needLocation) {
          send({ event:'status', msg:'No GPS — using approximate IP location…' });
          const ip = await ipLocate();
          if (ip) {
            plan = await planAndFetch(query, ip);
            send({ event:'geo', approx: ip });
          }
        }

        if (plan.candidates?.length) send({ event:'candidates', candidates: plan.candidates });
        if (plan.status) send({ event:'status', msg: plan.status });

        if (plan.profile) {
          send({ event:'profile', profile: {
            title: plan.profile.title, description: plan.profile.description,
            extract: plan.profile.extract, image: plan.profile.image, wikiUrl: plan.profile.pageUrl
          }});
        }

        if (plan.places?.length) {
          send({ event:'places', places: plan.places });
          await streamPlain(send, `Found ${plan.places.length} places. Showing closest first.`);
          send({ event:'final', snapshot:{ id: rid(), markdown:'(streamed)', cites:[], timeline:[], confidence: plan.places.length ? 'medium' : 'low' } });
          controller.close(); return;
        }

        const cites = plan.cites || [];
        for (const c of cites) send({ event:'cite', cite: c });

        const subj = plan.profile?.title || plan.plan.subject || query.trim();
        send({ event:'related', items: relatedSuggestions(subj) });
        send({ event:'llm', provider: process.env.OPENAI_API_KEY ? 'openai' : (process.env.GEMINI_API_KEY ? 'gemini' : 'none') });

        if (!cites.length) {
          await streamPlain(send, `No sources found yet. Ensure your CSE is set to “Search the entire web.”`);
          send({ event:'final', snapshot:{ id: rid(), markdown:'(no sources)', cites:[], timeline:[], confidence:'low' } });
          controller.close(); return;
        }

        const text = await summarizeWithCitations({ subject: subj, sources: cites.map(c=>({title:c.title,url:c.url})), style:'simple' });
        await streamPlain(send, text);

        const conf = cites.length >= 3 ? 'high' : (cites.length ? 'medium' : 'low');
        send({ event:'final', snapshot:{ id: rid(), markdown:'(streamed)', cites, timeline:[], confidence: conf } });
      } catch (e:any) {
        const msg=e?.message || String(e);
        sse((s)=>controller.enqueue(enc(s)))({ event:'error', msg });
        sse((s)=>controller.enqueue(enc(s)))({ event:'final', snapshot:{ id: rid(), markdown: msg, cites:[], timeline:[], confidence:'low' } });
      } finally { controller.close(); }
    }
  });

  return new Response(stream, { headers: { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive' } });
}
