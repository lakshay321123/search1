export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { planAndFetch } from '@/lib/think/orchestrator';
import { getLLMStream } from '@/lib/llm/stream';
import { relatedFor } from '@/lib/think/related';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

type Req = { query: string; coords?: { lat:number, lon:number }; provider?: 'openai'|'gemini'|'auto' };

export async function POST(req: Request) {
  const { query, coords, provider='auto' } = await req.json() as Req;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));

      try {
        if (!query?.trim()) {
          send({ event:'final', snapshot:{ id: rid(), markdown:'(empty query)', cites:[], timeline:[], confidence:'low' }});
          controller.close(); return;
        }

        const plan = await planAndFetch(query, coords);
        if (plan.candidates?.length) send({ event:'candidates', candidates: plan.candidates });
        if (plan.status) send({ event:'status', msg: plan.status });

        // Related suggestions (chips)
        const subject = plan.profile?.title || plan.plan.subject || query.trim();
        send({ event:'related', items: relatedFor(plan.plan.intent, subject) });

        if (plan.plan?.needLocation) {
          send({ event:'status', msg: 'Please allow location to search near you.' });
          send({ event:'final', snapshot:{ id: rid(), markdown:'(need location)', cites:[], timeline:[], confidence:'low' } });
          controller.close(); return;
        }

        if (plan.profile) {
          send({ event:'profile', profile: {
            title: plan.profile.title,
            description: plan.profile.description,
            extract: plan.profile.extract,
            image: plan.profile.image,
            wikiUrl: plan.profile.pageUrl
          }});
        }

        if (plan.places?.length) {
          send({ event:'places', places: plan.places });
          send({ event:'status', msg: `Found ${plan.places.length} places nearby.` });
          send({ event:'final', snapshot:{ id: rid(), markdown:'(places)', cites:[], timeline:[], confidence: plan.places.length?'medium':'low' } });
          controller.close(); return;
        }

        const cites = plan.cites || [];
        for (const c of cites) send({ event:'cite', cite: c });

        // If we have zero sources, broaden once so LLM never sees empty sources
        if (!cites.length) {
          send({ event:'status', msg:'No sources yet — broadening web search…' });
          const { searchCSEMany } = await import('@/lib/tools/googleCSE');
          const broaden = await searchCSEMany([ query, `${query} site:wikipedia.org`, `${query} site:linkedin.com`, `${query} reviews`, `${query} official` ], 3);
          for (const h of broaden) {
            if (!cites.find(c => c.url === h.url)) {
              const c = { id: String(cites.length + 1), ...h };
              cites.push(c); send({ event:'cite', cite: c });
            }
            if (cites.length >= 10) break;
          }
        }

        const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
        const subj = subject;
        const sys = `You are Wizkid. Write a concise answer in <= 200 words with per-sentence [n] citations from the numbered sources. Avoid speculation.`;
        const prompt = cites.length
          ? `${sys}\n\nSubject/Query: ${subj}\n\nNumbered sources:\n${sourceList}\n`
          : `${sys}\n\nSubject/Query: ${subj}\n\n(No numbered sources available. Respond in 2–4 sentences and suggest one refined query.)`;

        const { streamText } = await getLLMStream(provider);
        let any = false;
        for await (const chunk of streamText(prompt)) {
          any = true; send({ event:'token', text: chunk });
        }
        if (!any) send({ event:'token', text: cites[0]?.snippet || 'No sources found.' });

        const conf = cites.length >= 3 ? 'high' : (cites.length ? 'medium' : 'low');
        send({ event:'final', snapshot:{ id: rid(), markdown:'(streamed)', cites, timeline:[], confidence: conf } });
      } catch (e:any) {
        const msg = e?.message || String(e);
        send({ event:'error', msg });
        send({ event:'final', snapshot:{ id: rid(), markdown: msg, cites:[], timeline:[], confidence:'low' } });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive' }});
}
