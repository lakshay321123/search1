import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Cite } from '../types';
import { discoverPeople } from '../people/discover';
import { getWikidataSocials } from '../tools/wikidata';
import { findSocialLinks, searchCSEMany } from '../tools/googleCSE';
import { domainScore, recordShow } from '../learn/domains';
import { nameScore } from '../text/similarity';
import { rid, norm, streamPlain } from './utils';

type Bias = { prefer: Map<string, number>; avoid: Map<string, number> };

type PeopleOpts = {
  query: string;
  workingQuery: string;
  askFor: string;
  bias: Bias;
  send: (o: any) => void;
};

export async function handlePeople({ query, workingQuery, askFor, bias, send }: PeopleOpts) {
  let cites: Cite[] = [];
  const prelim: Cite[] = [];
  const push = (url?: string, title?: string, snippet?: string) => url && prelim.push({ id: String(prelim.length + 1), url, title: title || url, snippet });

  const { primary: top0, others: alts0 } = await discoverPeople(askFor);
  const all: any[] = [];
  if (top0) all.push(top0);
  if (alts0) all.push(...alts0);
  for (const c of all) {
    const pref = bias.prefer.get(c.name) || 0;
    const av = bias.avoid.get(c.name) || 0;
    const sim = nameScore(workingQuery, c.name);
    c.fameScore = (c.fameScore || 0) + pref * 5000 + sim * 1000 - av * 7000;
  }
  all.sort((a, b) => b.fameScore - a.fameScore);
  const top = all[0];
  const alts = all.slice(1, 6);
  if (alts.length)
    send({ event: 'candidates', candidates: alts.map((o) => ({ title: o.name, description: o.description, image: o.image, url: o.wikiUrl })) });
  if (top)
    send({ event: 'profile', profile: { title: top.name, description: top.description, image: top.image, wikiUrl: top.wikiUrl } });

  const subjectName = top?.name || askFor;
  send({
    event: 'related',
    items: [
      { label: 'Main achievements', prompt: `What are ${subjectName}’s main achievements?` },
      { label: 'Career timeline', prompt: `Give a dated career timeline of ${subjectName}.` },
      { label: 'Controversies', prompt: `What controversies has ${subjectName} faced?` },
      { label: 'Social profiles', prompt: `List official social media profiles of ${subjectName}.` },
      { label: 'Recent news', prompt: `What’s the latest news about ${subjectName}?` },
    ],
  });

  const wd = await getWikidataSocials(subjectName);
  const socialCSE = await findSocialLinks(subjectName);
  const web = await searchCSEMany(
    [
      subjectName,
      `${subjectName} biography`,
      `${subjectName} achievements`,
      `site:wikipedia.org ${subjectName}`,
      `site:linkedin.com ${subjectName}`,
      `site:instagram.com ${subjectName}`,
      `site:facebook.com ${subjectName}`,
    ],
    3
  );

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

  web.forEach((r) => push(r.url, r.title, r.snippet));

  const seen = new Set<string>();
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
  cites = scored.map((x) => x.c);
  for (const c of cites) {
    await recordShow(c.url);
    send({ event: 'cite', cite: c });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  let streamed = false;
  let quotaHit = false;
  const sys = `You are Wizkid, a citation-first assistant.\nWrite a concise PERSON BIO in <= 200 words (6–10 sentences).\nSTRICT RULES:\n- Use ONLY the numbered sources below. If a fact isn’t supported there, omit it.\n- After EACH sentence, include a [n] citation. No sentence without a citation.\n- Prefer dated facts and current titles. If dates conflict, omit the claim.\n- No meta commentary or speculation.`;
  const sourceList = cites.map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`).join('\n');
  const prompt = `${sys}\n\nSubject: ${subjectName}\n\nNumbered sources:\n${sourceList}\n`;

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
    send({ event: 'status', msg: 'summarizing' });
    try {
      await tryModel('gemini-1.5-flash-8b');
    } catch (e: any) {
      quotaHit = /429|quota/i.test(String(e?.message || e || ''));
    }
    if (!streamed && !quotaHit) {
      try {
        await tryModel('gemini-1.5-flash');
      } catch (e2: any) {
        quotaHit ||= /429|quota/i.test(String(e2?.message || e2 || ''));
      }
    }
  }
  if (!streamed) await streamPlain(send, `Here’s a short profile of ${subjectName} from the cited sources.\n`);

  const conf = cites.length >= 3 ? 'high' : cites.length >= 1 ? 'medium' : 'low';
  send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites, timeline: [], confidence: conf } });
}
