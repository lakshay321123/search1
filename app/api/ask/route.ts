export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { GoogleGenerativeAI } from '@google/generative-ai';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
const rid = () =>
  (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

/* -------------------- Wikipedia (photo + extract) -------------------- */
async function fetchWikiProfile(q: string): Promise<Profile | null> {
  const t = encodeURIComponent(q.trim());
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${t}?redirect=true`;
  const r = await fetch(url, { next: { revalidate: 3600 } });
  if (!r.ok) return null;
  const j: any = await r.json();
  const image = j.originalimage?.source || j.thumbnail?.source || undefined;
  const pageUrl = j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${t}`;
  return { title: j.title, description: j.description, extract: j.extract, wikiUrl: pageUrl, image };
}

/* -------------------- Google CSE (links incl. socials) --------------- */
function domainOf(u: string) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function normalize(u: string) { try { const x = new URL(u); x.hash=''; x.search=''; return x.toString(); } catch { return u; } }

async function searchCSE(q: string, num = 8) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=${num}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return [];
  const j: any = await r.json();
  const items: any[] = j.items || [];
  const seen = new Set<string>();
  const out: Cite[] = [];
  for (const it of items.slice(0, num)) {
    const url = normalize(it.link);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ id: String(out.length + 1), url, title: it.title, snippet: it.snippet });
  }
  return out;
}

async function findSocialLinks(name: string) {
  const queries = [
    `site:wikipedia.org ${name}`,
    `site:instagram.com ${name}`,
    `site:facebook.com ${name}`,
    `site:x.com ${name}`,
    `site:twitter.com ${name}`
  ];
  const batches = await Promise.all(queries.map(q => searchCSE(q, 3)));
  const flat = batches.flat();
  const pick = (host: string) => flat.find(r => domainOf(r.url).endsWith(host));
  return {
    wiki: pick('wikipedia.org'),
    insta: pick('instagram.com'),
    fb: pick('facebook.com'),
    x: pick('x.com') || pick('twitter.com'),
    all: flat
  };
}

/* -------------------- Route handler (SSE) ---------------------------- */
export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json() as { query: string; style?: 'simple'|'expert' };

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));

      try {
        // Emit profile first (photo + short desc)
        const [wiki, socials] = await Promise.all([fetchWikiProfile(query), findSocialLinks(query)]);
        if (wiki) {
          send({ event: 'profile', profile: {
            title: wiki.title, description: wiki.description, extract: wiki.extract, image: wiki.image, wikiUrl: wiki.wikiUrl
          }});
        }

        // Build cites (socials + general search)
        const base = await searchCSE(query, 8);
        const prelim: Cite[] = [];
        const push = (c?: Cite) => c && prelim.push({ ...c, id: String(prelim.length + 1) });
        push(socials.wiki); push(socials.insta); push(socials.fb); push(socials.x);
        base.forEach(c => push(c));

        // dedupe + cap 10
        const seen = new Set<string>(); const cites: Cite[] = [];
        for (const c of prelim) {
          const k = normalize(c.url);
          if (!seen.has(k)) { seen.add(k); cites.push({ ...c, id: String(cites.length + 1) }); }
          if (cites.length >= 10) break;
        }
        cites.forEach(c => send({ event: 'cite', cite: c }));

        // Stream the 200-word bio via Gemini
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY missing');

        send({ event: 'status', msg: 'summarizing' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          tools: [{ googleSearch: {} }] as any
        });

        const sourceList = cites.map((c, i) => `[${i+1}] ${c.title} — ${c.url}`).join('\n');
        const wikiExtract = wiki?.extract ? `Wikipedia says:\n${wiki.extract}\n` : '';
        const sys = `You are Wizkid, a neutral, citation-first assistant.
Write a concise PERSON BIO in <= 200 words (6–10 sentences).
Use inline [n] citations for key claims. Prefer official sources.
Style: ${style === 'expert' ? 'Expert' : 'Simple'}.`;

        const prompt = `${sys}

Question: Who is ${query}?

Numbered sources:
${sourceList}

${wikiExtract}
Instructions:
- Start with identity + current role.
- Add dated milestones.
- Keep <= 200 words. Use [n] citations.`;

        let streamedAny = false;
        const res = await model.generateContentStream({
          contents: [{ role: 'user', parts: [{ text: prompt }]}]
        });

        for await (const ev of res.stream) {
          const t = typeof (ev as any).text === 'function'
            ? (ev as any).text()
            : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
          if (t) { streamedAny = true; send({ event: 'token', text: t }); }
        }

        // Also emit any citations Gemini returns
        try {
          const full: any = await res.response;
          const gm = full?.candidates?.[0]?.groundingMetadata;
          const chunks = gm?.groundingChunks || [];
          const extra = chunks
            .map((g: any) => {
              const uri = g?.web?.uri || g?.retrievedContext?.uri;
              const title = g?.web?.title || uri;
              return uri ? { url: normalize(uri), title } as Cite : null;
            })
            .filter(Boolean) as Cite[];

          // merge/dedupe
          const seen2 = new Set(cites.map(c => normalize(c.url)));
          for (const e of extra) {
            const k = normalize(e.url);
            if (!seen2.has(k)) {
              seen2.add(k);
              const cite = { ...e, id: String(seen2.size) };
              send({ event: 'cite', cite });
              cites.push(cite);
            }
          }
        } catch { /* ignore */ }

        // If Gemini yielded nothing, fallback to wiki extract
        if (!streamedAny && wiki?.extract) {
          send({ event: 'token', text: wiki.extract.slice(0, 1200) });
        }

        send({ event: 'final',
          snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: cites.length>=3?'high':(cites.length?'medium':'low') }
        });
      } catch (err: any) {
        // Surface an error message to the UI instead of staying blank
        const msg = (err?.message || 'Unknown error');
        send({ event: 'error', msg });
        send({ event: 'final', snapshot: { id: rid(), markdown: msg, cites: [], timeline: [], confidence: 'low' } });
      } finally {
        controller.close();
      }
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

