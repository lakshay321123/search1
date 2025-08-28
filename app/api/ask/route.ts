export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../../../lib/types';
import { fetchWikiProfile } from '../../../lib/wiki';
import { searchCSE, findSocialLinks } from '../../../lib/tools/googleCSE';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };

export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));
      try {
        // 1) Profile (photo) + social links
        const [wiki, socials] = await Promise.all([fetchWikiProfile(query), findSocialLinks(query)]);
        if (wiki) send({ event: 'profile', profile: { title: wiki.title, description: wiki.description, extract: wiki.extract, image: wiki.image, wikiUrl: wiki.pageUrl } });

        // 2) Seed cites (socials + general CSE)
        const base = await searchCSE(query, 8);
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

        // 3) Stream the 200-word bio
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY missing');

        send({ event: 'status', msg: 'summarizing' });
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', tools: [{ googleSearch: {} }] } as any);

        const sourceList = cites.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n');
        const wikiExtract = wiki?.extract ? `Wikipedia says:\n${wiki.extract}\n` : '';
        const sys = `You are Wizkid, a neutral, citation-first assistant.\nWrite a concise PERSON BIO in <= 200 words (6–10 sentences). Use inline [n] citations. Prefer official sources. Style: ${style}.`;
        const prompt = `${sys}\n\nQuestion: Who is ${query}?\n\nNumbered sources:\n${sourceList}\n\n${wikiExtract}Instructions:\n- Start with identity + current role.\n- Add dated milestones.\n- Keep <= 200 words. Use [n] citations.`;

        let streamed = false;
        const res = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: prompt }]}] });
        for await (const ev of res.stream) {
          const t = typeof (ev as any).text === 'function'
            ? (ev as any).text()
            : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
          if (t) { streamed = true; send({ event: 'token', text: t }); }
        }

        // Add any Gemini-provided citations
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
            if (!seen2.has(k)) { seen2.add(k); const c = { ...e, id: String(seen2.size) }; send({ event: 'cite', cite: c }); cites.push(c); }
          }
        } catch {}

        if (!streamed && wiki?.extract) send({ event: 'token', text: wiki.extract.slice(0, 1200) });
        send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: cites.length>=3?'high':(cites.length?'medium':'low') } });
      } catch (e: any) {
        send({ event: 'error', msg: e?.message || String(e) });
        send({ event: 'final', snapshot: { id: rid(), markdown: e?.message || 'error', cites: [], timeline: [], confidence: 'low' } });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }
  });
}

