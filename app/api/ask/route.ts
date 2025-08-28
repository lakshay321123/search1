// app/api/ask/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { searchCSE, findSocialLinks } from '../../../lib/tools/googleCSE';
import { getWikidataSocials } from '../../../lib/tools/wikidata';

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
  const { query } = await req.json() as AskRequest;
  const subjectName = query;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));
      try {
        // 1) Wikidata socials (free + official)
        const wd = await getWikidataSocials(subjectName);

        // 2) CSE socials + general web
        const [base, socials] = await Promise.all([
          searchCSE(subjectName, 8),
          findSocialLinks(subjectName)
        ]);

        const prelim: any[] = [];
        const push = (c?: any) =>
          c && prelim.push({ id: String(prelim.length + 1), url: c.url, title: c.title, snippet: c.snippet });

        // Prefer official Wikidata links first (they’ll dedupe with CSE later)
        if (wd.website) push({ url: wd.website, title: 'Official website' });
        if (wd.linkedin) push({ url: wd.linkedin, title: 'LinkedIn' });
        if (wd.instagram) push({ url: wd.instagram, title: 'Instagram' });
        if (wd.facebook) push({ url: wd.facebook, title: 'Facebook' });
        if (wd.x || wd.twitter) push({ url: wd.x || wd.twitter, title: 'X (Twitter)' });

        // Then CSE-found socials
        push(socials.wiki);
        push(socials.linkedin);
        push(socials.insta);
        push(socials.fb);
        push(socials.x);

        // Then general CSE results
        base.forEach(push);

        // emit prelim cites
        prelim.forEach(c => send({ event: 'cite', cite: c }));

        send({ event: 'status', msg: 'searching Wikipedia' });
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(subjectName)}`);
        if (res.ok) {
          const data = await res.json();
          const text = data.extract || 'No summary available.';
          const cite = { id: String(prelim.length + 1), url: data.content_urls?.desktop?.page || '', title: data.title };
          send({ event: 'token', text });
          send({ event: 'cite', cite });
          send({
            event: 'final',
            snapshot: { id: rid(), markdown: text, cites: [...prelim, cite], timeline: [], confidence: 'medium' }
          });
        } else {
          send({ event: 'status', msg: 'no results found' });
        }
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
