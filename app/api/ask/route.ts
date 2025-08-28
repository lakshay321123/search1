export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../../../lib/types';
import { wikiDisambiguate } from '../../../lib/wiki';
import { searchCSE, findSocialLinks } from '../../../lib/tools/googleCSE';

// ---------- tiny helpers ----------
const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// stream any text in small chunks to mimic typing
async function streamPlain(send: (o:any)=>void, text: string) {
  const chunks = text.match(/.{1,90}(\s|$)/g) || [text]; // ~90 chars per chunk
  for (const ch of chunks) {
    send({ event: 'token', text: ch });
    // tiny yield so Vercel flushes; adjust if you like
    // await sleep(10);
  }
}

type RelatedItem = { label: string, prompt: string };
function relatedForPerson(name: string): RelatedItem[] {
  return [
    { label: 'Main achievements', prompt: `What are ${name}’s main achievements as Union Home Minister?` },
    { label: 'Election strategy', prompt: `How did ${name} help BJP win key seats in Uttar Pradesh?` },
    { label: 'Controversies', prompt: `What controversies or legal issues has ${name} faced during his career?` },
    { label: 'Co-operation role', prompt: `How has ${name}’s role evolved since becoming Minister of Co-operation?` },
    { label: 'Early influences', prompt: `How did ${name}’s early work with ABVP and RSS shape his politics?` },
  ];
}

function wikiOnlySummary(extract?: string, name?: string) {
  if (!extract) return `I could not reach the model right now. Here’s a short profile of ${name || 'the person'} from Wikipedia’s lead section.\n`;
  const s = extract.replace(/\s+/g,' ').trim();
  // keep under ~200 words
  const words = s.split(' ');
  return words.slice(0, 200).join(' ') + (words.length > 200 ? '…' : '');
}

// ---------- main handler ----------
export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json() as { query: string; style?: 'simple'|'expert' };

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));

      try {
        // A) Disambiguate on Wikipedia (case-insensitive)
        const { primary, others } = await wikiDisambiguate(query);
        if (others.length) {
          send({ event: 'candidates', candidates: others.map(o => ({
            title: o.title, description: o.description, image: o.image, url: o.pageUrl
          }))});
        }
        if (primary) {
          send({ event: 'profile', profile: {
            title: primary.title, description: primary.description, extract: primary.extract,
            image: primary.image, wikiUrl: primary.pageUrl
          }});
        }
        const subjectName = primary?.title || query.trim();
        send({ event: 'related', items: relatedForPerson(subjectName) });

        // B) Build cites (socials + web). If CSE is empty, fall back to Wikipedia links.
        const [base, socials] = await Promise.all([
          searchCSE(subjectName, 8),
          findSocialLinks(subjectName)
        ]);
        const prelim: Cite[] = [];
        const push = (c?: any) => c && prelim.push({ id: String(prelim.length + 1), url: c.url, title: c.title, snippet: c.snippet });
        push(socials.wiki); push(socials.linkedin); push(socials.insta); push(socials.fb); push(socials.x);
        base.forEach(push);
        if (prelim.length === 0) { // no CSE? use Wikipedia pages so we always have sources
          if (primary?.pageUrl) push({ url: primary.pageUrl, title: primary.title, snippet: primary.description });
          others.slice(0,4).forEach(o => push({ url: o.pageUrl, title: o.title, snippet: o.description }));
        }
        const seen = new Set<string>(); const cites: Cite[] = [];
        for (const c of prelim) {
          const k = norm(c.url);
          if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length + 1) }); }
          if (cites.length >= 10) break;
        }
        cites.forEach(c => send({ event: 'cite', cite: c }));

        // C) Try Gemini. First a cheaper model, then the bigger one. On 429, fall back to no-LLM summary.
        const apiKey = process.env.GEMINI_API_KEY;
        let streamed = false;
        let quotaHit = false;

        const tryModel = async (modelName: string) => {
          const genAI = new GoogleGenerativeAI(apiKey!);
          const model = genAI.getGenerativeModel({ model: modelName, tools: [{ googleSearch: {} }] } as any);
          const sourceList = cites.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const wikiExtract = primary?.extract ? `Wikipedia says:\n${primary.extract}\n` : '';
          const sys = `You are Wizkid, a neutral, citation-first assistant.
Write a concise PERSON BIO in <= 200 words (6–10 sentences). Use inline [n] citations that match the numbered sources. Prefer official sources.
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

          const res = await model.generateContentStream({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
          for await (const ev of res.stream) {
            const t = typeof (ev as any).text === 'function'
              ? (ev as any).text()
              : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
            if (t) { streamed = true; send({ event: 'token', text: t }); }
          }

          // merge any citations Gemini returned
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
        };

        if (apiKey) {
          send({ event: 'status', msg: 'summarizing' });
          try {
            // try the 8B first (cheaper, often higher rate)
            await tryModel('gemini-1.5-flash-8b');
          } catch (e: any) {
            const msg = String(e?.message || e || '');
            quotaHit = /429|quota/i.test(msg);
            if (quotaHit) {
              send({ event: 'status', msg: 'model rate-limited, falling back' });
            } else {
              // non-quota error: try the bigger one once
              try { await tryModel('gemini-1.5-flash'); } catch (e2) {
                // if still fails, we’ll fall back below
              }
            }
          }

          // if first attempt produced nothing, try the bigger model
          if (!streamed && !quotaHit) {
            try { await tryModel('gemini-1.5-flash'); } catch (e3: any) {
              if (/429|quota/i.test(String(e3?.message || e3 || ''))) quotaHit = true;
            }
          }
        }

        // D) Guaranteed text path (no LLM)
        if (!streamed) {
          const fallback = wikiOnlySummary(primary?.extract, subjectName);
          if (quotaHit) send({ event: 'status', msg: 'Using Wikipedia fallback (Gemini quota exceeded)' });
          await streamPlain(send, fallback);
        }

        const conf = cites.length >= 3 ? 'high' : (cites.length >= 1 ? 'medium' : 'low');
        send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
      } catch (e: any) {
        const msg = e?.message || String(e);
        send({ event: 'error', msg });
        send({ event: 'final', snapshot: { id: rid(), markdown: msg, cites: [], timeline: [], confidence: 'low' } });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }
  });
}
