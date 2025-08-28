export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../../../lib/types';
import { discoverPeople } from '../../../lib/people/discover';
import { getWikidataSocials } from '../../../lib/tools/wikidata';
import { findSocialLinks, searchCSEMany } from '../../../lib/tools/googleCSE';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const norm = (u: string) => { try { const x=new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } };
async function streamPlain(send:(o:any)=>void, text:string){ for (const ch of (text.match(/.{1,90}(\s|$)/g) || [text])) send({event:'token', text: ch}); }

export async function POST(req: Request) {
  const { query, subject, style = 'simple' } = await req.json() as { query: string; subject?: string; style?: 'simple'|'expert' };

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s)=>controller.enqueue(enc(s)));
      try {
        // 0) Subject lock
        const askFor = (subject && subject.trim()) || query.trim();

        // 1) People discovery
        const { primary: top, others: alts } = await discoverPeople(askFor);
        if (alts?.length) send({ event: 'candidates', candidates: alts.map(o => ({ title:o.name, description:o.description, image:o.image, url:o.wikiUrl }))});
        if (top) send({ event: 'profile', profile: { title: top.name, description: top.description, image: top.image, wikiUrl: top.wikiUrl } });

        const subjectName = top?.name || askFor;
        send({ event: 'related', items: [
          { label: 'Main achievements', prompt: `What are ${subjectName}’s main achievements?` },
          { label: 'Career timeline',   prompt: `Give a dated career timeline of ${subjectName}.` },
          { label: 'Controversies',     prompt: `What controversies has ${subjectName} faced?` },
          { label: 'Social profiles',   prompt: `List official social media profiles of ${subjectName}.` },
          { label: 'Recent news',       prompt: `What’s the latest news about ${subjectName}?` },
        ]});

        // 2) Build citations (official socials first, then web)
        const wd = await getWikidataSocials(subjectName);
        const socialCSE = await findSocialLinks(subjectName);
        const web = await searchCSEMany([
          subjectName, `${subjectName} biography`, `${subjectName} achievements`,
          `site:wikipedia.org ${subjectName}`, `site:linkedin.com ${subjectName}`,
          `site:instagram.com ${subjectName}`, `site:facebook.com ${subjectName}`
        ], 3);

        const prelim: Cite[] = [];
        const push = (url?: string, title?: string, snippet?: string) => url && prelim.push({ id: String(prelim.length+1), url, title: title || url, snippet });

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

        const seen = new Set<string>(); const cites: Cite[] = [];
        for (const c of prelim) {
          const k = norm(c.url);
          if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length+1) }); }
          if (cites.length >= 10) break;
        }
        cites.forEach(c => send({ event: 'cite', cite: c }));

        // 3) Summarize (Gemini -> fallback)
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
          const model = genAI.getGenerativeModel({ model: name, tools: [{ googleSearch: {} }] } as any);
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
          try { await tryModel('gemini-1.5-flash-8b'); }
          catch (e:any) { quotaHit = /429|quota/i.test(String(e?.message||e||'')); }
          if (!streamed && !quotaHit) {
            try { await tryModel('gemini-1.5-flash'); } catch (e2:any) { quotaHit ||= /429|quota/i.test(String(e2?.message||e2||'')); }
          }
        }

        if (!streamed) {
          const fallback = `A short profile of ${subjectName} based on the cited sources (especially Wikipedia).\n`;
          send({ event: 'status', msg: quotaHit ? 'Using Wikipedia fallback (Gemini quota)' : 'Using Wikipedia fallback' });
          await streamPlain(send, fallback);
        }

        const conf = cites.length >= 3 ? 'high' : (cites.length >= 1 ? 'medium' : 'low');
        send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
      } catch (e:any) {
        send({ event: 'error', msg: e?.message || String(e) });
        send({ event: 'final', snapshot: { id: rid(), markdown: 'error', cites: [], timeline: [], confidence: 'low' } });
      } finally { controller.close(); }
    }
  });

  return new Response(stream, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive' } });
}

