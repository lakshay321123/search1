export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { detectIntent } from '../../../lib/intent';
import { searchCSEMany, cseMissing, findSocialLinks } from '../../../lib/tools/googleCSE';
import { wikiDisambiguate } from '../../../lib/wiki';
import { getWikidataSocials } from '../../../lib/tools/wikidata';
import { searchNearbyOverpass } from '../../../lib/local/overpass';
import { nameScore } from '../../../lib/text/similarity';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };
async function streamPlain(send:(o:any)=>void, text:string){ if (!text) return; for (const ch of (text.match(/.{1,90}(\s|$)/g) || [text])) send({event:'token', text: ch}); }

type Cite = { id: string; url: string; title: string; snippet?: string };
type Req = { query: string; subject?: string; coords?: { lat: number, lon: number } };

export async function POST(req: Request) {
  const { query, subject, coords } = await req.json() as Req;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));
      try {
        let working = (query || '').trim();
        if (!working) { send({event:'final', snapshot:{ id: rid(), markdown:'(empty query)', cites:[], timeline:[], confidence:'low' }}); controller.close(); return; }

        const intent = detectIntent(working);

        // ===== LOCAL =====
        if (intent === 'local') {
          if (!coords?.lat || !coords?.lon) {
            send({ event: 'status', msg: 'need_location' });
            await streamPlain(send, 'Please allow location to find places near you.');
            send({ event: 'final', snapshot: { id: rid(), markdown: '(need location)', cites: [], timeline: [], confidence: 'low' } });
            controller.close(); return;
          }
          const { places, usedCategory } = await searchNearbyOverpass(working, coords.lat, coords.lon, 6000);
          send({ event: 'status', msg: `local:${usedCategory || 'unknown'} (${places.length} found)` });
          send({ event: 'places', places });
          if (places.length) await streamPlain(send, `Top ${usedCategory || 'places'} near you: ` + places.slice(0,5).map(p => `${p.name} (${Math.round((p.distance_m||0)/100)/10}km)`).join(', ') + '.');
          else await streamPlain(send, `0 found right now. Overpass can be busy — try again in a minute or widen the radius.`);
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites: [], timeline: [], confidence: places.length ? 'medium' : 'low' } });
          controller.close(); return;
        }

        // ===== PEOPLE =====
        if (intent === 'people') {
          const { primary, others } = await wikiDisambiguate(working);

          if (others?.length) {
            send({ event: 'candidates', candidates: others.map(o => ({
              title: o.title, description: o.description, image: o.image, url: o.pageUrl
            }))});
          }

          if (!primary || nameScore(working, primary.title) < 0.85) {
            await streamPlain(send, `Multiple profiles found for “${working}”. Please pick the right one above.`);
            send({ event: 'final', snapshot: { id: rid(), markdown: '(awaiting selection)', cites: [], timeline: [], confidence: 'low' } });
            controller.close(); return;
          }

          // hero card
          send({ event: 'profile', profile: {
            title: primary.title, description: primary.description, extract: primary.extract,
            image: primary.image, wikiUrl: primary.pageUrl
          }});

          // socials: Wikidata first, then CSE fallback
          const wd = await getWikidataSocials(primary.title);
          const socialCSE = await findSocialLinks(primary.title);

          // citations
          const prelim: Cite[] = [];
          const push = (u?:string,t?:string,s?:string)=>u&&prelim.push({id:String(prelim.length+1),url:norm(u),title:t||u,snippet:s});
          if (primary.pageUrl) push(primary.pageUrl, 'Wikipedia');
          if (wd.website) push(wd.website, 'Official website');
          if (wd.linkedin) push(wd.linkedin, 'LinkedIn');
          if (wd.instagram) push(wd.instagram, 'Instagram');
          if (wd.facebook) push(wd.facebook, 'Facebook');
          if (wd.x) push(wd.x, 'X (Twitter)');

          const sPick = (h?: {url:string;title:string;snippet?:string}) => h && push(h.url, h.title, h.snippet);
          sPick(socialCSE.linkedin); sPick(socialCSE.insta); sPick(socialCSE.fb); sPick(socialCSE.x);

          // general web sources
          const web = await searchCSEMany([
            primary.title, `${primary.title} biography`, `${primary.title} achievements`,
            `site:wikipedia.org ${primary.title}`, `site:linkedin.com ${primary.title}`, `site:instagram.com ${primary.title}`, `site:facebook.com ${primary.title}`
          ], 3);
          web.forEach(r => push(r.url, r.title, r.snippet));

          // dedupe & emit
          const seen = new Set<string>(); const cites: Cite[] = [];
          for (const c of prelim) { if (!seen.has(c.url)) { seen.add(c.url); cites.push({ ...c, id: String(cites.length+1) }); } if (cites.length>=10) break; }
          cites.forEach(c => send({ event:'cite', cite:c }));

          // summary (Gemini → fallback)
          let streamed = false;
          const apiKey = process.env.GEMINI_API_KEY;
          const sys = `You are Wizkid. Write a <=200 word bio with per-sentence [n] citations from the numbered sources. No speculation.`;
          const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const prompt = `${sys}\n\nSubject: ${primary.title}\n\nNumbered sources:\n${sourceList}\n`;

          const tryModel = async (name: string) => {
            const genAI = new GoogleGenerativeAI(apiKey!);
            const model = genAI.getGenerativeModel({ model: name });
            const res = await model.generateContentStream({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
            for await (const ev of (res as any).stream) {
              const t = typeof (ev as any).text === 'function'
                ? (ev as any).text()
                : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
              if (t && /\S/.test(t)) { streamed = true; send({ event: 'token', text: t }); }
            }
          };
          if (apiKey && cites.length) { try { await tryModel('gemini-1.5-flash-8b'); } catch {} if (!streamed) { try { await tryModel('gemini-1.5-flash'); } catch {} } }
          if (!streamed) {
            const text = cites.slice(0,5).map((c,i)=>`${c.title} [${i+1}]: ${c.snippet || ''}`).join('\n');
            await streamPlain(send, text || `See sources above for details.`);
          }

          const conf = cites.length >= 3 ? 'high' : (cites.length ? 'medium' : 'low');
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
          controller.close(); return;
        }

        // ===== COMPANY / GENERAL =====
        {
          const askFor = (subject && subject.trim()) || working;
          if (cseMissing()) send({ event: 'status', msg: 'cse_missing' });

          const web = await searchCSEMany([
            askFor, `${askFor} official site`, `${askFor} overview`, `${askFor} directors`, `${askFor} team`,
            `site:wikipedia.org ${askFor}`, `site:linkedin.com ${askFor}`
          ], 4);

          const prelim: Cite[] = []; const push = (u?:string,t?:string,s?:string)=>u&&prelim.push({id:String(prelim.length+1),url:norm(u),title:t||u,snippet:s});
          web.forEach(r => push(r.url, r.title, r.snippet));
          if (!prelim.length) {
            // Wikipedia summary fallback
            const sum = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(askFor)}?redirect=true`, { cache: 'no-store' });
            if (sum.ok) {
              const j:any = await sum.json();
              const page = j?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(askFor.replace(/\s/g,'_'))}`;
              push(page, j?.title || askFor, j?.extract || '');
            }
          }

          const seen = new Set<string>(); const cites: Cite[] = [];
          for (const c of prelim) { if (!seen.has(c.url)) { seen.add(c.url); cites.push({ ...c, id: String(cites.length+1) }); } if (cites.length>=10) break; }
          cites.forEach(c => send({ event:'cite', cite:c }));

          let streamed = false;
          const apiKey = process.env.GEMINI_API_KEY;
          const sys = `You are Wizkid. Write a concise answer in <= 180 words with per-sentence [n] citations from the numbered sources.`;
          const sourceList = cites.map((c,i)=>`[${i+1}] ${c.title} — ${c.url}`).join('\n');
          const prompt = `${sys}\n\nQuery: ${askFor}\n\nNumbered sources:\n${sourceList}\n`;

          const tryModel = async (name: string) => {
            const genAI = new GoogleGenerativeAI(apiKey!);
            const model = genAI.getGenerativeModel({ model: name });
            const res = await model.generateContentStream({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
            for await (const ev of (res as any).stream) {
              const t = typeof (ev as any).text === 'function'
                ? (ev as any).text()
                : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
              if (t && /\S/.test(t)) { streamed = true; send({ event: 'token', text: t }); }
            }
          };

          if (apiKey && cites.length) { try { await tryModel('gemini-1.5-flash-8b'); } catch {} if (!streamed) { try { await tryModel('gemini-1.5-flash'); } catch {} } }
          if (!streamed) {
            const text = cites.slice(0,5).map((c,i)=>`${c.title} [${i+1}]: ${c.snippet || ''}`).join('\n');
            await streamPlain(send, text || `No sources found. ${cseMissing() ? 'Web search disabled (missing key).' : ''}`);
          }

          const conf = cites.length >= 3 ? 'high' : (cites.length ? 'medium' : 'low');
          send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
          controller.close(); return;
        }
      } catch (e:any) {
        const msg = e?.message || String(e);
        sse((s)=>controller.enqueue(enc(s)))({ event:'error', msg });
        sse((s)=>controller.enqueue(enc(s)))({ event:'final', snapshot:{ id: rid(), markdown: msg, cites:[], timeline:[], confidence:'low' } });
      } finally { controller.close(); }
    }
  });

  return new Response(stream, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive' } });
}
