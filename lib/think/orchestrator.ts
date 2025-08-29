import { detectIntent } from "../intent";
import { wikiDisambiguate } from "../wiki";
import { getWikidataSocials } from "../tools/wikidata";
import { peopleCandidatesFromCSE, findSocialLinks, searchCSEMany } from "../tools/googleCSE";
import { geoapifyPlaces } from "../local/geoapify";
import { overpassPlaces } from "../local/overpass";
import { nameScore } from "../text/similarity";
import { wikiSuggest } from "../text/spell";
import type { Orchestrated, Cite } from "../types";

const norm = (u:string)=>{ try{const x=new URL(u); x.hash=''; x.search=''; return x.toString();}catch{return u;} };

export async function planAndFetch(query: string, coords?: {lat:number, lon:number}): Promise<Orchestrated> {
  let q = query.trim();
  const intent = detectIntent(q);
  const out: Orchestrated = { plan: { intent }, cites: [] };

  const suggestion = await wikiSuggest(q);
  if (suggestion && nameScore(q, suggestion) < 0.7) q = suggestion;
  out.plan.subject = q;

  // PEOPLE
  if (intent === 'people') {
    const { primary, others } = await wikiDisambiguate(q);
    // if wiki is empty or a weak match → build from CSE
    if (!primary || nameScore(q, primary.title) < 0.75) {
      const cseCands = await peopleCandidatesFromCSE(q);
      if (cseCands.length) return { ...out, candidates: cseCands, status: 'ambiguous' };
    }
    if (others?.length) out.candidates = others;
    if (!primary) return { ...out, status: 'ambiguous' };

    out.profile = primary;

    // socials + web
    const wd = await getWikidataSocials(primary.title).catch(()=> ({} as any));
    const s = await findSocialLinks(primary.title);
    const prelim: Cite[] = [];
    const push=(u?:string,t?:string,sn?:string)=>u && prelim.push({ id:String(prelim.length+1), url:norm(u), title:t||u, snippet:sn });
    if (primary.pageUrl) push(primary.pageUrl, 'Wikipedia');
    if (wd.website)  push(wd.website, 'Official website');
    if (wd.linkedin) push(wd.linkedin, 'LinkedIn');
    if (wd.instagram)push(wd.instagram,'Instagram');
    if (wd.facebook) push(wd.facebook, 'Facebook');
    if (wd.x)        push(wd.x,        'X (Twitter)');
    const sPick=(h?:any)=>h && push(h.url,h.title,h.snippet);
    sPick(s.linkedin); sPick(s.insta); sPick(s.fb); sPick(s.x);
    const web = await searchCSEMany([ primary.title, `${primary.title} interview`, `${primary.title} achievements` ], 3);
    web.forEach(r=>push(r.url,r.title,r.snippet));
    const seen=new Set<string>(); out.cites=[];
    for (const c of prelim) { if (!seen.has(c.url)) { seen.add(c.url); out.cites.push({ ...c, id:String(out.cites.length+1) }); } if (out.cites.length>=10) break; }
    return out;
  }

  // LOCAL
  if (intent === 'local') {
    if (!coords?.lat || !coords?.lon) return { ...out, plan:{...out.plan, needLocation:true}, status:'need_location' };
    const g = await geoapifyPlaces(q, coords.lat, coords.lon, 6000);
    const o = await overpassPlaces(q, coords.lat, coords.lon, 6000);
    const merged = [...g, ...o];
    return { ...out, places: merged, status: `local:${q} (${merged.length} found)` };
  }

  // COMPANY / GENERAL
  {
    const web = await searchCSEMany([ q, `${q} official site`, `${q} overview`, `${q} directors`, `${q} contact`, `${q} review` ], 4);
    const seen = new Set<string>();
    for (const h of web) { const u = norm(h.url); if (!seen.has(u)) { seen.add(u); out.cites.push({ id:String(out.cites.length+1), url:u, title:h.title, snippet:h.snippet }); } if (out.cites.length>=10) break; }
    return out;
  }
}
