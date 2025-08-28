export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite, Place } from '../../../lib/types';
import { detectIntent } from '../../../lib/intent';
import { discoverPeople } from '../../../lib/people/discover';
import { getWikidataSocials } from '../../../lib/tools/wikidata';
import { findSocialLinks, searchCSEMany } from '../../../lib/tools/googleCSE';
import { searchNearbyOverpass } from '../../../lib/local/overpass';
import { searchNearbyGeoapify } from '../../../lib/local/geoapify';
import { streamOpenAI } from '../../../lib/llm/openai';
import { domainScore, recordShow } from '../../../lib/learn/domains';
import { loadEntityBias } from '../../../lib/learn/entities';
import { nameScore } from '../../../lib/text/similarity';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };
async function streamPlain(send:(o:any)=>void, text:string){ for (const ch of (text.match(/.{1,90}(\s|$)/g) || [text])) send({event:'token', text: ch}); }

async function streamLLM(prompt: string, provider: 'auto'|'openai'|'gemini', send:(o:any)=>void) {
  const wantOpenAI = provider === 'openai' || (provider === 'auto' && process.env.OPENAI_API_KEY);
  if (wantOpenAI) {
    try { await streamOpenAI(prompt, t => send({ event:'token', text:t })); return true; } catch {}
  }
  const key = process.env.GEMINI_API_KEY;
  const wantGemini = provider === 'gemini' || (provider === 'auto' && key);
  if (wantGemini && key) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const names = ['gemini-1.5-flash-8b','gemini-1.5-flash'];
      for (const name of names) {
        try {
          const model = genAI.getGenerativeModel({ model: name } as any);
          const res = await model.generateContentStream({ contents:[{ role:'user', parts:[{ text: prompt }]}] });
          for await (const ev of (res as any).stream) {
            const t = typeof (ev as any).text === 'function'
              ? (ev as any).text()
              : (ev as any)?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join('') || '';
            if (t) send({ event:'token', text: t });
          }
          return true;
        } catch {}
      }
    } catch {}
  }
  return false;
}

type Req = { query: string; subject?: string; coords?: { lat: number, lon: number }; provider?: 'auto'|'openai'|'gemini' };

export async function POST(req: Request) {
  const body = await req.json() as Req;
  const { query, subject, coords, provider = 'auto' } = body;
  const workingQuery = query.trim();
  const bias = await loadEntityBias(workingQuery);

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));
      try {
        const intent = detectIntent(query);
        // LOCAL MODE (near me)
        if (intent === 'local' && coords?.lat && coords?.lon) {
          let places: Place[] = await searchNearbyGeoapify(query, coords.lat, coords.lon);
          if (!places.length) {
            const fallback = await searchNearbyOverpass(query, coords.lat, coords.lon);
            places = fallback.places;
          }
          send({ event: 'status', msg: 'local' });
          send({ event: 'places', places });
          if (places.length) {
            const line = `Top places near you: ${places.slice(0,5).map(p => `${p.name} (${Math.round((p.distance_m||0)/100)/10}km)`).join(', ')}. `;
            await streamPlain(send, line);
          } else {
            await streamPlain(send, `I couldn’t find relevant results near you. Try expanding the radius or a different term.`);
          }
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites: [], timeline: [], confidence: places.length ? 'medium' : 'low' } });
          controller.close(); return;
        }

        // PEOPLE or COMPANY/GENERAL
        const askFor = (subject && subject.trim()) || workingQuery;
        let cites: Cite[] = [];
        const prelim: Cite[] = [];
        const push = (url?: string, title?: string, snippet?: string) => url && prelim.push({ id: String(prelim.length+1), url, title: title || url, snippet });

        // PEOPLE: discover + UI scaffolding
        if (intent === 'people') {
          const { primary: top0, others: alts0 } = await discoverPeople(askFor);
          const all = [] as any[];
          if (top0) all.push(top0);
          if (alts0) all.push(...alts0);
          for (const c of all) {
            const pref = bias.prefer.get(c.name) || 0;
            const av = bias.avoid.get(c.name) || 0;
            const sim = nameScore(workingQuery, c.name);
            c.fameScore = (c.fameScore || 0) + pref * 5000 + sim * 1000 - av * 7000;
          }
          all.sort((a,b)=>b.fameScore - a.fameScore);
          const top = all[0];
          const alts = all.slice(1,6);
          if (alts.length) send({ event: 'candidates', candidates: alts.map(o => ({ title:o.name, description:o.description, image:o.image, url:o.wikiUrl }))});
          if (top) send({ event: 'profile', profile: { title: top.name, description: top.description, image: top.image, wikiUrl: top.wikiUrl } });

          const subjectName = top?.name || askFor;
          send({ event: 'related', items: [
            { label: 'Main achievements', prompt: `What are ${subjectName}’s main achievements?` },
            { label: 'Career timeline',   prompt: `Give a dated career timeline of ${subjectName}.` },
            { label: 'Controversies',     prompt: `What controversies has ${subjectName} faced?` },
            { label: 'Social profiles',   prompt: `List official social media profiles of ${subjectName}.` },
            { label: 'Recent news',       prompt: `What’s the latest news about ${subjectName}?` },
          ]});

          // Official socials first, then web
          const wd = await getWikidataSocials(subjectName);
          const socialCSE = await findSocialLinks(subjectName);
          const web = await searchCSEMany([
            subjectName, `${subjectName} biography`, `${subjectName} achievements`,
            `site:wikipedia.org ${subjectName}`, `site:linkedin.com ${subjectName}`,
            `site:instagram.com ${subjectName}`, `site:facebook.com ${subjectName}`
          ], 3);

          if (wd.website) push(wd.website, 'Official website');
          if (wd.linkedin) push(wd.linkedin, 'LinkedIn');
          if (wd.instagram) push(wd.instagram, 'Instagram');
          if (wd.facebook) push(wd.facebook, 'Facebook');
          if (wd.x || wd.twitter) push(wd.x || wd.twitter, 'X (Twitter)');
          if (top?.wikiUrl) push(top.wikiUrl, 'Wikipedia');

          if (socialCSE.wiki?.url) push(socialCSE.wiki.url, 'Wikipedia');
          if (socialCSE.linkedin?.url) push(socialCSE.linkedin.url, 'LinkedIn');
          if (socialCSE.insta?.url) push(socialCSE.insta.url, 'Instagram');
          if (socialCSE.fb?.url) push(socialCSE.fb.url, 'Facebook');
          if (socialCSE.x?.url) push(socialCSE.x.url, 'X (Twitter)');

          web.forEach(r => push(r.url, r.title, r.snippet));

          const seen = new Set<string>(); for (const c of prelim) { const k = norm(c.url); if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length+1) }); } if (cites.length>=10) break; }
          const scored = await Promise.all(cites.map(async c => ({ c, s: await domainScore(c.url) })));
          scored.sort((a,b)=>b.s - a.s);
          cites = scored.map(x=>x.c);
          for (const c of cites) { await recordShow(c.url); send({ event: 'cite', cite: c }); }

          // Summarize
          const sys = `You are Wizkid, a citation-first assistant.
Write a concise PERSON BIO in <= 200 words (6–10 sentences).
STRICT RULES:
- Use ONLY the numbered sources below. If a fact isn’t supported there, omit it.
- After EACH sentence, include a [n] citation. No sentence without a citation.
- Prefer dated facts and current titles. If dates conflict, omit the claim.
- No meta commentary or speculation.`;
          const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const prompt = `${sys}\n\nSubject: ${subjectName}\n\nNumbered sources:\n${sourceList}\n`;

          send({ event: 'status', msg: 'summarizing' });
          const streamed = await streamLLM(prompt, provider, send);
          if (!streamed) await streamPlain(send, `Here’s a short profile of ${subjectName} from the cited sources.\n`);

          const conf = cites.length >= 3 ? 'high' : (cites.length >= 1 ? 'medium' : 'low');
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
          controller.close(); return;
        }

        // COMPANY / GENERAL: multi-query web + concise summary
        {
          const web = await searchCSEMany([
            askFor, `${askFor} official site`, `${askFor} overview`, `${askFor} directors`, `${askFor} team`,
            `site:wikipedia.org ${askFor}`, `site:linkedin.com ${askFor}`
          ], 4);
          const prelim: Cite[] = []; const push = (u?:string,t?:string,s?:string)=>u&&prelim.push({id:String(prelim.length+1),url:u,title:t||u,snippet:s});
          web.forEach(r => push(r.url, r.title, r.snippet));

          const seen = new Set<string>(); const cites: Cite[] = [];
          for (const c of prelim) { const k = norm(c.url); if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length+1) }); } if (cites.length>=10) break; }
          const scored = await Promise.all(cites.map(async c => ({ c, s: await domainScore(c.url) })));
          scored.sort((a,b)=>b.s - a.s);
          const reordered = scored.map(x=>x.c);
          for (const c of reordered) { await recordShow(c.url); send({ event: 'cite', cite: c }); }
          cites.splice(0, cites.length, ...reordered);

          // stream concise answer
          const sys = `You are Wizkid, a citation-first assistant.
Write a concise answer in <= 180 words with per-sentence [n] citations referencing the numbered sources. Only use facts supported by sources. No meta commentary.`;
          const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const prompt = `${sys}\n\nQuery: ${askFor}\n\nNumbered sources:\n${sourceList}\n`;

          const streamed = await streamLLM(prompt, provider, send);
          if (!streamed) {
            const text = cites.slice(0,5).map((c,i)=>`${c.title} [${i+1}]: ${c.snippet || ''}`).join('\n');
            await streamPlain(send, text || `I couldn’t generate a summary, but the sources above may help.`);
          }

          const conf = cites.length >= 3 ? 'high' : (cites.length >= 1 ? 'medium' : 'low');
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
          controller.close(); return;
        }
      } catch (e:any) {
        const msg = e?.message || String(e);
        sse((s)=>controller.enqueue(enc(s)))({ event: 'error', msg });
        sse((s)=>controller.enqueue(enc(s)))({ event: 'final', snapshot: { id: rid(), markdown: msg, cites: [], timeline: [], confidence: 'low' } });
      } finally { controller.close(); }
    }
  });

  return new Response(stream, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive' } });
}
