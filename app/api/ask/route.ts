// app/api/ask/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AskRequest { query: string; style?: 'simple' | 'expert'; }

function enc(s: string) { return new TextEncoder().encode(s); }
function sse(write: (s: string) => void) {
  return (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
}
function rid() {
  // @ts-ignore
  return (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2);
}

import { discoverPeople } from '../../../lib/people/discover';
import { searchCSE } from '../../../lib/tools/googleCSE';

interface Cite { id: string; url: string; title: string; snippet?: string }

export async function POST(req: Request) {
  const { query } = await req.json() as AskRequest;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));
      send({ event: 'status', msg: 'discovering people' });
      try {
        const { primary: top, others: alts } = await discoverPeople(query);

        // emit alternates
        if (alts.length) {
          send({ event: 'candidates', candidates: alts.map(o => ({
            title: o.name, description: o.description, image: o.image, url: o.wikiUrl
          }))});
        }

        // emit hero card immediately
        if (top) {
          send({ event: 'profile', profile: {
            title: top.name, description: top.description, extract: undefined, image: top.image, wikiUrl: top.wikiUrl
          }});
        }

        // build “related” follow-ups
        const subjectName = top?.name || query.trim();
        send({ event: 'related', items: [
          { label: 'Main achievements', prompt: `What are ${subjectName}’s main achievements?` },
          { label: 'Career timeline',   prompt: `Give a dated career timeline of ${subjectName}.` },
          { label: 'Controversies',     prompt: `What controversies has ${subjectName} faced?` },
          { label: 'Social profiles',   prompt: `List official social media profiles of ${subjectName}.` },
          { label: 'Recent news',       prompt: `What’s the latest news about ${subjectName}?` },
        ]});

        // make sure we always have some cites even if CSE is empty
        const prelim: Cite[] = [];
        const push = (url?: string, title?: string, snippet?: string) =>
          url && title && prelim.push({ id: String(prelim.length+1), url, title, snippet });

        // Prefer official socials first
        if (top?.socials?.wiki)      push(top.socials.wiki, 'Wikipedia');
        if (top?.socials?.website)   push(top.socials.website, 'Official website');
        if (top?.socials?.linkedin)  push(top.socials.linkedin, 'LinkedIn');
        if (top?.socials?.instagram) push(top.socials.instagram, 'Instagram');
        if (top?.socials?.facebook)  push(top.socials.facebook, 'Facebook');
        if (top?.socials?.x)         push(top.socials.x, 'X (Twitter)');

        // fallback: general web via your existing searchCSE
        const base = await searchCSE(subjectName, 8);
        for (const r of base) push(r.url, r.title, r.snippet);

        // dedupe + cap 10 and emit
        const seen = new Set<string>(); const cites: Cite[] = [];
        for (const c of prelim) {
          try { const u = new URL(c.url); u.hash=''; u.search=''; const k = u.toString();
            if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length+1) }); }
          } catch { cites.push({ ...c, id: String(cites.length+1) }); }
          if (cites.length >= 10) break;
        }
        cites.forEach(c => send({ event: 'cite', cite: c }));

        // fetch summary from Wikipedia if available
        let text = '';
        if (top?.wikiUrl) {
          try {
            const wikiApi = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.name.replace(/\s/g,'_'))}`;
            const res = await fetch(wikiApi);
            if (res.ok) {
              const data = await res.json();
              text = data.extract || '';
            }
          } catch {}
        }
        if (!text) text = 'No summary available.';

        send({ event: 'token', text });
        send({ event: 'final', snapshot: { id: rid(), markdown: text, cites, timeline: [], confidence: 'medium' } });
      } catch (err: any) {
        send({ event: 'status', msg: `error: ${err.message}` });
      }
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
