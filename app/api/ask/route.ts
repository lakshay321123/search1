export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../../../lib/types';
import { wikiDisambiguate } from '../../../lib/wiki';
import { searchCSE, findSocialLinks } from '../../../lib/tools/googleCSE';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };

type RelatedItem = { label: string, prompt: string };

function relatedQuestionsForPerson(name: string): RelatedItem[] {
  // Template-based (fast & free); swap to Gemini-generated if you prefer.
  return [
    { label: 'Main achievements', prompt: `What are ${name}’s main achievements as Union Home Minister?` },
    { label: 'Election strategy', prompt: `How did ${name} help BJP win key seats in Uttar Pradesh?` },
    { label: 'Controversies', prompt: `What controversies or legal issues has ${name} faced during his career?` },
    { label: 'Co-operation role', prompt: `How has ${name}’s role evolved since becoming Minister of Co-operation?` },
    { label: 'Early influences', prompt: `How did ${name}’s early work with ABVP and RSS shape his politics?` },
  ];
}

export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json() as { query: string; style?: 'simple'|'expert' };

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));

      try {
        // 0) Disambiguate (like ChatGPT): primary + candidates
        const { primary, others } = await wikiDisambiguate(query);

        // Emit alternates so user can click a different one
        if (others.length) {
          send({ event: 'candidates', candidates: others.map(o => ({
            title: o.title, description: o.description, image: o.image, url: o.pageUrl
          }))});
        }

        // If we have a primary Wikipedia profile, show the hero card immediately
        if (primary) {
          send({ event: 'profile', profile: {
            title: primary.title, description: primary.description, extract: primary.extract,
            image: primary.image, wikiUrl: primary.pageUrl
          }});
        }

        // Also surface "Related" follow-ups (chips under the input)
        const subjectName = primary?.title || query.trim();
        send({ event: 'related', items: relatedQuestionsForPerson(subjectName) });

        // 1) Build sources (socials + general CSE) using the resolved name
        const [base, socials] = await Promise.all([
          searchCSE(subjectName, 8),
          findSocialLinks(subjectName)
        ]);
        const prelim: Cite[] = [];
        const push = (c?: any) => c && prelim.push({ id: String(prelim.length + 1), url: c.url, title: c.title, snippet: c.snippet });
        push(socials.wiki); push(socials.insta); push(socials.fb); push(socials.x);
        base.forEach(push);

        const seen = new Set<string>(); const cites: Cite[] = [];
        for (const c of prelim) {
          const k = norm(c.url);
          if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length + 1) }); }
          if (cites.length >= 10) break;
        }
        cites.forEach(c => send({ event: 'cite', cite: c }));

        // 2) Stream the 200-word bio (like ChatGPT typing)
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY missing');

        send({ event: 'status', msg: 'summarizing' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', tools: [{ googleSearch: {} }] } as any);

        const sourceList = cites.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n');
        const wikiExtract = primary?.extract ? `Wikipedia says:\n${primary.extract}\n` : '';
        const sys = `You are Wizkid, a neutral, citation-first assistant.
Write a concise PERSON BIO in <= 200 words (6–10 sentences). Use inline [n] citations matching the numbered sources. Prefer official sources.
Style: ${style === 'expert' ? 'Expert' : 'Simple'}.`;

        const prompt = `${sys}

Subject: ${subjectName}

Numbered sources:
${sourceList}

${wikiExtract}
Instructions:
- Start with identity + current role.
- Add dated milestones and notable actions.
- Keep <= 200 words. Use [n] citations.`;

        let streamed = false;
        const res = await model.generateContentStream({ contents: [{ role:'user', parts: [{ text: prompt }]}] });
        for await (const ev of res.stream) {
          const t = typeof (ev as any).text === 'function'
            ? (ev as any).text()
            : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
          if (t) { streamed = true; send({ event: 'token', text: t }); }
        }

        // Merge any Gemini-provided citations
        try {
          const full: any = await res.response;
          const gm = full?.candidates?.[0]?.groundingMetadata;
          const chunks = gm?.groundingChunks || [];
          const extra = chunks.map((g: any) => {
            const uri = g?.web?.uri || g?.retrievedContext?.uri;
            const title = g?.web?.title || uri;
            return uri ? { url: norm(uri), title } as Cite : null;
          }).filter(Boolean) as Cite[];

          const seen2 = new Set(cites.map(c => norm(c.url)));
          for (const e of extra) {
            const k = norm(e.url);
            if (!seen2.has(k)) {
              seen2.add(k);
              const c = { ...e, id: String(seen2.size) };
              send({ event: 'cite', cite: c });
              cites.push(c);
            }
          }
        } catch {}

        // Fallback: if nothing streamed, at least show the wiki extract
        if (!streamed && primary?.extract) send({ event: 'token', text: primary.extract.slice(0,1200) });

        send({ event: 'final',
          snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: cites.length>=3?'high':(cites.length?'medium':'low') }
        });
      } catch (e: any) {
        // Surface errors
        const msg = e?.message || String(e);
        const errId = rid();
        send({ event: 'error', msg, id: errId });
        send({ event: 'final', snapshot: { id: errId, markdown: msg, cites: [], timeline: [], confidence: 'low' } });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }
  });
}
