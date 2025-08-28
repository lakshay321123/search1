export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../../../lib/types';
import { detectIntent } from '../../../lib/intent';
import { discoverPeople } from '../../../lib/people/discover';
import { getWikidataSocials } from '../../../lib/tools/wikidata';
import { findSocialLinks, searchCSEMany } from '../../../lib/tools/googleCSE';
import { searchNearbyOverpass } from '../../../lib/local/overpass';
import { domainScore, recordShow } from '../../../lib/learn/domains';
import { loadEntityBias } from '../../../lib/learn/entities';
import { nameScore } from '../../../lib/text/similarity';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };
async function streamPlain(send:(o:any)=>void, text:string){ for (const ch of (text.match(/.{1,90}(\s|$)/g) || [text])) send({event:'token', text: ch}); }

type Req = { query: string; subject?: string; coords?: { lat: number, lon: number }; style?: 'simple'|'expert' };

export async function POST(req: Request) {
  const body = await req.json() as Req;
  const { query, subject, coords, style = 'simple' } = body;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));
      try {
        const intent = detectIntent(query);
        const workingQuery = query.trim();
        const bias = await loadEntityBias(workingQuery);

        // LOCAL (“near me”)
        if (intent === 'local') {
          if (!coords?.lat || !coords?.lon) {
            send({ event: 'status', msg: 'need_location' });
            await streamPlain(send, 'Please allow location to find places near you.');
            send({ event: 'final', snapshot: { id: rid(), markdown: '(need location)', cites: [], timeline: [], confidence: 'low' } });
            controller.close(); return;
          }
          const { places, usedCategory } = await searchNearbyOverpass(workingQuery, coords.lat, coords.lon, 6000);
          send({ event: 'status', msg: `local:${usedCategory || 'unknown'}` });
          send({ event: 'places', places });
          if (places.length) {
            await streamPlain(send, `Top ${usedCategory || 'places'} near you: ` + places.slice(0,5).map(p => `${p.name} (${Math.round((p.distance_m||0)/100)/10}km)`).join(', ') + '. ');
          } else {
            await streamPlain(send, `I couldn’t find ${usedCategory || 'relevant'} results near you. Try allowing location or expanding the radius.`);
          }
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites: [], timeline: [], confidence: places.length ? 'medium' : 'low' } });
          controller.close(); return;
        }

        // PEOPLE
        if (intent === 'people') {
          const { primary: top0, others: alts0 } = await discoverPeople(workingQuery);

          // Apply memory bias (prefer/avoid) & re-rank candidates
          const allCands = [ ...(top0 ? [top0] : []), ...(alts0 || []) ];
          for (const c of allCands) {
            const pref = bias.prefer.get(c.name) || 0;
            const av   = bias.avoid.get(c.name)  || 0;
            const sim  = nameScore(workingQuery, c.name);
            c.fameScore = (c.fameScore || 0) + pref*5000 + sim*1000 - av*7000;
          }
          allCands.sort((a,b)=>b.fameScore - a.fameScore);
          const top = allCands[0]; const alts = allCands.slice(1, 6);

          if (alts.length) send({ event: 'candidates', candidates: alts.map(o => ({ title:o.name, description:o.description, image:o.image, url:o.wikiUrl }))});

          // Only auto-pick if it’s a strong match
          if (!top || nameScore(workingQuery, top.name) < 0.90) {
            await streamPlain(send, `I found multiple profiles for “${workingQuery}”. Please pick the right one above.`);
            send({ event: 'final', snapshot: { id: rid(), markdown: '(awaiting selection)', cites: [], timeline: [], confidence: 'low' } });
            controller.close(); return;
          }

          send({ event: 'profile', profile: { title: top.name, description: top.description, image: top.image, wikiUrl: top.wikiUrl } });

          const subjectName = top.name;
          send({ event: 'related', items: [
            { label: 'Main achievements', prompt: `What are ${subjectName}’s main achievements?` },
            { label: 'Career timeline',   prompt: `Give a dated career timeline of ${subjectName}.` },
            { label: 'Controversies',     prompt: `What controversies has ${subjectName} faced?` },
            { label: 'Social profiles',   prompt: `List official social media profiles of ${subjectName}.` },
            { label: 'Recent news',       prompt: `What’s the latest news about ${subjectName}?` },
          ]});

          // Build citations (officials + web)
          const prelim: Cite[] = []; const push = (u?:string,t?:string,s?:string)=>u&&prelim.push({id:String(prelim.length+1),url:u,title:t||u,snippet:s});
          const wd = await getWikidataSocials(subjectName);
          const socialCSE = await findSocialLinks(subjectName);
          const web = await searchCSEMany([subjectName, `${subjectName} biography`, `${subjectName} achievements`,
            `site:wikipedia.org ${subjectName}`, `site:linkedin.com ${subjectName}`, `site:instagram.com ${subjectName}`, `site:facebook.com ${subjectName}`], 3);

          if (wd.website) push(wd.website, 'Official website');
          if (wd.linkedin) push(wd.linkedin, 'LinkedIn');
          if (wd.instagram) push(wd.instagram, 'Instagram');
          if (wd.facebook) push(wd.facebook, 'Facebook');
          if (wd.x || (wd as any).twitter) push(wd.x || (wd as any).twitter, 'X (Twitter)');
          if (top.wikiUrl) push(top.wikiUrl, 'Wikipedia');

          if (socialCSE.wiki?.url) push(socialCSE.wiki.url, 'Wikipedia');
          if (socialCSE.linkedin?.url) push(socialCSE.linkedin.url, 'LinkedIn');
          if (socialCSE.insta?.url) push(socialCSE.insta.url, 'Instagram');
          if (socialCSE.fb?.url) push(socialCSE.fb.url, 'Facebook');
          if (socialCSE.x?.url) push(socialCSE.x.url, 'X (Twitter)');

          web.forEach(r => push(r.url, r.title, r.snippet));

          // dedupe + learn-based order
          const seen = new Set<string>(); const cites: Cite[] = [];
          for (const c of prelim) { const k = norm(c.url); if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length+1) }); } if (cites.length>=10) break; }

          const scored = await Promise.all(cites.map(async c => ({ c, s: await domainScore(c.url) })));
          scored.sort((a,b)=>b.s - a.s);
          for (const {c} of scored) { await recordShow(c.url); send({ event:'cite', cite:c }); }

          // Summarize (Gemini → stitched fallback)
          const apiKey = process.env.GEMINI_API_KEY;
          let streamed = false; let quotaHit = false;

          const sys = `You are Wizkid, a citation-first assistant.
Write a concise PERSON BIO in <= 200 words (6–10 sentences).
STRICT RULES:
- Use ONLY the numbered sources below. If a fact isn’t supported there, omit it.
- After EACH sentence, include a [n] citation. No sentence without a citation.
- Prefer dated facts and current titles. If dates conflict, omit the claim.
- No meta commentary or speculation.`;
          const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const prompt = `${sys}\n\nSubject: ${subjectName}\n\nNumbered sources:\n${sourceList}\n`;

          const tryModel = async (name: string) => {
            const genAI = new GoogleGenerativeAI(apiKey!);
            const model = genAI.getGenerativeModel({ model: name, tools: [{ googleSearch: {} }] as any });
            const res = await model.generateContentStream({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
            for await (const ev of (res as any).stream) {
              const t = typeof (ev as any).text === 'function'
                ? (ev as any).text()
                : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
              if (t) { streamed = true; send({ event: 'token', text: t }); }
            }
          };

          if (apiKey) {
            send({ event: 'status', msg: 'summarizing' });
            try { await tryModel('gemini-1.5-flash-8b'); } catch (e:any) { quotaHit = /429|quota/i.test(String(e?.message||e||'')); }
            if (!streamed && !quotaHit) { try { await tryModel('gemini-1.5-flash'); } catch (e2:any) { quotaHit ||= /429|quota/i.test(String(e2?.message||e2||'')); } }
          }
          if (!streamed) {
            // stitched fallback: use snippets
            const lines = cites.slice(0,6).map((c,i)=> (c.snippet ? `${c.snippet.replace(/\s+/g,' ').trim()} [${i+1}].` : '')).filter(Boolean);
            await streamPlain(send, lines.join(' ') || `See sources above for details.`);
          }

          const conf = cites.length >= 3 ? 'high' : (cites.length >= 1 ? 'medium' : 'low');
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
          controller.close(); return;
        }

        // COMPANY / GENERAL
        {
          const askFor = (subject && subject.trim()) || workingQuery;
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
          for (const {c} of scored) { await recordShow(c.url); send({ event:'cite', cite:c }); }

          // stream concise answer (Gemini → fallback)
          const apiKey = process.env.GEMINI_API_KEY;
          let streamed = false;
          const sys = `You are Wizkid, a citation-first assistant.
Write a concise answer in <= 180 words with per-sentence [n] citations referencing the numbered sources. Only use facts supported by sources. No meta commentary.`;
          const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const prompt = `${sys}\n\nQuery: ${askFor}\n\nNumbered sources:\n${sourceList}\n`;

          const tryModel = async (name: string) => {
            const genAI = new GoogleGenerativeAI(apiKey!);
            const model = genAI.getGenerativeModel({ model: name, tools: [{ googleSearch: {} }] as any });
            const res = await model.generateContentStream({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
            for await (const ev of (res as any).stream) {
              const t = typeof (ev as any).text === 'function'
                ? (ev as any).text()
                : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
              if (t) { streamed = true; send({ event: 'token', text: t }); }
            }
          };

          if (apiKey) { try { await tryModel('gemini-1.5-flash-8b'); } catch {} if (!streamed) { try { await tryModel('gemini-1.5-flash'); } catch {} } }
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
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive' } });
}
