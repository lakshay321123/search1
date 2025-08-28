import { GoogleGenerativeAI } from '@google/generative-ai';
import { discoverPeople } from '../../../lib/people/discover';
import { searchCSE } from '../../../lib/tools/googleCSE';
import { wikiSummary } from '../../../lib/wiki';
import type { Cite } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AskRequest { query: string }

function enc(s: string) { return new TextEncoder().encode(s); }
function sse(write: (s: string) => void) { return (o: any) => write(`data: ${JSON.stringify(o)}\n\n`); }
function rid() { return (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2); }

export async function POST(req: Request) {
  const { query } = await req.json() as AskRequest;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));
      try {
        const { primary: top, others: alts } = await discoverPeople(query);

        if (alts.length) {
          send({ event: 'candidates', candidates: alts.map(o => ({
            title: o.name, description: o.description, image: o.image, url: o.wikiUrl
          }))});
        }

        if (top) {
          send({ event: 'profile', profile: {
            title: top.name,
            description: top.description,
            image: top.image,
            wikiUrl: top.wikiUrl,
            socials: top.socials
          }});
        }

        const subjectName = top?.name || query.trim();
        send({ event: 'related', items: [
          { label: 'Main achievements', prompt: `What are ${subjectName}'s main achievements?` },
          { label: 'Career timeline', prompt: `Give a dated career timeline of ${subjectName}.` },
          { label: 'Controversies', prompt: `What controversies has ${subjectName} faced?` },
          { label: 'Social profiles', prompt: `List official social media profiles of ${subjectName}.` },
          { label: 'Recent news', prompt: `What’s the latest news about ${subjectName}?` },
        ]});

        const prelim: Cite[] = [];
        const push = (url?: string, title?: string, snippet?: string) => {
          if (url && title) prelim.push({ id: String(prelim.length+1), url, title, snippet });
        };

        if (top?.socials?.wiki)      push(top.socials.wiki, 'Wikipedia');
        if (top?.socials?.website)   push(top.socials.website, 'Official website');
        if (top?.socials?.linkedin)  push(top.socials.linkedin, 'LinkedIn');
        if (top?.socials?.instagram) push(top.socials.instagram, 'Instagram');
        if (top?.socials?.facebook)  push(top.socials.facebook, 'Facebook');
        if (top?.socials?.x)         push(top.socials.x, 'X (Twitter)');

        const base = await searchCSE(`"${subjectName}"`, 8);
        for (const r of base) push(r.url, r.title, r.snippet);

        const seen = new Set<string>(); const cites: Cite[] = [];
        for (const c of prelim) {
          try {
            const u = new URL(c.url); u.hash=''; u.search=''; const k = u.toString();
            if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length+1) }); }
          } catch { cites.push({ ...c, id: String(cites.length+1) }); }
          if (cites.length >= 10) break;
        }
        cites.forEach(c => send({ event: 'cite', cite: c }));

        let finalText = '';
        const citeList = cites.map((c,i)=>`[${i+1}] ${c.title} - ${c.url}`).join('\n');
        const prompt = `Using the following sources, write a concise biography of ${subjectName} in under 200 words with citations in [n] form.\n\nSources:\n${citeList}`;
        const key = process.env.GEMINI_API_KEY;
        let usedFallback = false;
        if (key) {
          const genAI = new GoogleGenerativeAI(key);
          async function streamModel(modelName: string) {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: prompt }]}] });
            for await (const chunk of result.stream) {
              const t = chunk.text();
              if (t) { finalText += t; send({ event: 'token', text: t }); }
            }
          }
          try { await streamModel('gemini-1.5-flash-8b'); }
          catch (err) {
            try { await streamModel('gemini-1.5-flash'); }
            catch { usedFallback = true; }
          }
        } else { usedFallback = true; }

        if (usedFallback) {
          const extract = (await wikiSummary(subjectName))?.extract || 'No information available.';
          for (const word of extract.split(/\s+/)) {
            const t = word + ' ';
            finalText += t;
            send({ event: 'token', text: t });
          }
        }

        const confidence = cites.length >=5 ? 'high' : cites.length >=3 ? 'medium' : 'low';
        send({ event: 'final', snapshot: { id: rid(), markdown: finalText, cites, timeline: [], confidence } });
      } catch (err: any) {
        send({ event: 'error', error: err?.message || 'unknown' });
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
