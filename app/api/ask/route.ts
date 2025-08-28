export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../../../lib/types';
import { fetchWikiProfile } from '../../../lib/wiki';
import { searchCSE, findSocialLinks } from '../../../lib/tools/googleCSE';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () =>
  // @ts-ignore
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2);

export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json() as { query: string; style?: 'simple'|'expert' };

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));

      // 1) Emit profile (wiki image + description) + social links ASAP
      const [wiki, socials] = await Promise.all([fetchWikiProfile(query), findSocialLinks(query)]);
      if (wiki) {
        send({ event: 'profile', profile: {
          title: wiki.title, description: wiki.description, extract: wiki.extract, image: wiki.image, wikiUrl: wiki.pageUrl
        }});
      }

      // Build source list: start with socials/wiki, then a general CSE sweep
      const baseCSE = await searchCSE(query, 8);
      const prelim: Cite[] = [];
      const add = (u?: {title:string; url:string; snippet?:string}) => {
        if (!u) return;
        prelim.push({ id: String(prelim.length + 1), url: u.url, title: u.title, snippet: u.snippet });
      };
      add(socials.wiki); add(socials.insta); add(socials.fb); add(socials.x);
      for (const r of baseCSE) add(r);

      // Deduplicate and cap to 10 cites
      const seen = new Set<string>(); const cites: Cite[] = [];
      for (const c of prelim) {
        try { const u = new URL(c.url); u.hash=''; u.search=''; const k=u.toString();
          if (!seen.has(k)) { seen.add(k); cites.push(c); }
        } catch { cites.push(c); }
        if (cites.length >= 10) break;
      }

      // Emit source cards early (clickable while we write)
      cites.forEach(c => send({ event: 'cite', cite: c }));

      // 2) Stream the summary (<= 200 words), ChatGPT-style
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        send({ event: 'token', text: '**GEMINI_API_KEY missing**' });
        send({ event: 'final', snapshot: { id: rid(), markdown: 'Missing key', cites, timeline: [], confidence: 'low' } });
        controller.close(); return;
      }

      send({ event: 'status', msg: 'summarizing' });

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        tools: [{ googleSearch: {} }] // allow Gemini to fetch extra facts if needed
      } as any);

      const sourceList = cites.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n');
      const wikiExtract = wiki?.extract ? `Wikipedia says:\n${wiki.extract}\n` : '';
      const sys = `You are Wizkid, a neutral, citation-first assistant. 
Write a concise PERSON BIO in under 200 words (about 6–10 sentences max).
Use inline [n] citations that correspond to the numbered sources below. Prefer official/primary sources. 
If facts are disputed, say so neutrally. Style: ${style === 'expert' ? 'Expert' : 'Simple'}.`;

      const prompt = `${sys}

Question: Who is ${query}?

Numbered sources:
${sourceList}

${wikiExtract ? wikiExtract : ''}
Instructions:
- Start with 1–2 sentences that identify the person and current role.
- Then add key highlights with dates (career milestones, notable actions).
- Keep it <= 200 words. Use [n] citations for key claims.`;

      // stream tokens
      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }]}]
      });

      let sawText = false;
      // handle both SDK chunk shapes
      for await (const ev of result.stream) {
        const t = typeof (ev as any).text === 'function'
          ? (ev as any).text()
          : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
        if (t) { sawText = true; send({ event: 'token', text: t }); }
      }

      // Try to extract Gemini's grounding citations too (if any)
      let extra: Cite[] = [];
      try {
        const full: any = await result.response;
        const gm = full?.candidates?.[0]?.groundingMetadata;
        const chunks = gm?.groundingChunks || [];
        extra = chunks.map((g: any, i: number) => {
          const uri = g?.web?.uri || g?.retrievedContext?.uri;
          const title = g?.web?.title || uri || `Source ${i+1}`;
          return uri ? { id: String(cites.length + i + 1), url: uri, title } : null;
        }).filter(Boolean) as Cite[];
      } catch { /* ignore */ }

      // Emit any new sources Gemini referenced
      const merged = dedupeCites([...cites, ...extra]);
      merged.slice(cites.length).forEach(c => send({ event: 'cite', cite: c }));

      // Fallback: if model produced nothing, use wiki extract trimmed
      if (!sawText && wiki?.extract) {
        const trimmed = wiki.extract.slice(0, 1200);
        send({ event: 'token', text: trimmed });
      }

      send({ event: 'final',
        snapshot: { id: rid(), markdown: '(streamed)', cites: merged, timeline: [], confidence: merged.length>=3?'high':(merged.length?'medium':'low') }
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

function dedupeCites(arr: Cite[]) {
  const seen = new Set<string>(); const out: Cite[] = [];
  for (const c of arr) {
    try { const u = new URL(c.url); u.hash=''; u.search=''; const k=u.toString();
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    } catch { out.push(c); }
  }
  // re-number
  return out.map((c, i) => ({ ...c, id: String(i+1) }));
}
