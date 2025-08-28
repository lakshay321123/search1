import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../types';
import { searchCSEMany } from '../tools/googleCSE';
import { domainScore, recordShow } from '../learn/domains';
import { rid, norm, streamPlain } from './utils';

type GeneralOpts = {
  askFor: string;
  send: (o: any) => void;
};

export async function handleGeneral({ askFor, send }: GeneralOpts) {
  const web = await searchCSEMany([
    askFor,
    `${askFor} official site`,
    `${askFor} overview`,
    `${askFor} directors`,
    `${askFor} team`,
    `site:wikipedia.org ${askFor}`,
    `site:linkedin.com ${askFor}`,
  ], 4);
  const prelim: Cite[] = [];
  const push = (u?: string, t?: string, s?: string) => u && prelim.push({ id: String(prelim.length + 1), url: u, title: t || u, snippet: s });
  web.forEach((r) => push(r.url, r.title, r.snippet));

  const seen = new Set<string>();
  const cites: Cite[] = [];
  for (const c of prelim) {
    const k = norm(c.url);
    if (!seen.has(k)) {
      seen.add(k);
      cites.push({ ...c, id: String(cites.length + 1) });
    }
    if (cites.length >= 10) break;
  }
  const scored = await Promise.all(cites.map(async (c) => ({ c, s: await domainScore(c.url) })));
  scored.sort((a, b) => b.s - a.s);
  const reordered = scored.map((x) => x.c);
  for (const c of reordered) {
    await recordShow(c.url);
    send({ event: 'cite', cite: c });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  let streamed = false;
  const sys = `You are Wizkid, a citation-first assistant.\nWrite a concise answer in <= 180 words with per-sentence [n] citations referencing the numbered sources. Only use facts supported by sources. No meta commentary.`;
  const sourceList = reordered.map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join('\n');
  const prompt = `${sys}\n\nQuery: ${askFor}\n\nNumbered sources:\n${sourceList}\n`;

  const tryModel = async (name: string) => {
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({ model: name, tools: [{ googleSearch: {} }] } as any);
    const res = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    for await (const ev of (res as any).stream) {
      const t = typeof (ev as any).text === 'function'
        ? (ev as any).text()
        : (ev as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
      if (t) {
        streamed = true;
        send({ event: 'token', text: t });
      }
    }
  };

  if (apiKey) {
    try { await tryModel('gemini-1.5-flash-8b'); } catch {}
    if (!streamed) {
      try { await tryModel('gemini-1.5-flash'); } catch {}
    }
  }
  if (!streamed) {
    const text = reordered
      .slice(0, 5)
      .map((c, i) => `${c.title} [${i + 1}]: ${c.snippet || ''}`)
      .join('\n');
    await streamPlain(send, text || `I couldn’t generate a summary, but the sources above may help.`);
  }

  const conf = reordered.length >= 3 ? 'high' : reordered.length >= 1 ? 'medium' : 'low';
  send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites: reordered, timeline: [], confidence: conf } });
}
