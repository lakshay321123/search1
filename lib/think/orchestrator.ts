import { makePlan, Plan } from './planner';
import { wikiDisambiguate } from '@/lib/wiki';
import { getWikidataSocials } from '@/lib/tools/wikidata';
import { findSocialLinks, searchCSEMany } from '@/lib/tools/googleCSE';
import { nameScore } from '@/lib/text/similarity';
import { geoapifyPlaces } from '@/lib/local/geoapify';
import { overpassPlaces } from '@/lib/local/overpass';

export type Cite = { id: string; url: string; title: string; snippet?: string };
export type Orchestrated = { plan: Plan; profile?: any; candidates?: any[]; cites: Cite[]; places?: any[]; status?: string };

const norm = (u:string)=>{ try{const x=new URL(u); x.hash=''; x.search=''; return x.toString();}catch{return u;} };

export async function planAndFetch(query: string, coords?: {lat:number, lon:number}): Promise<Orchestrated> {
  let { intent, subject, notes } = await makePlan(query);
  const out: Orchestrated = { plan: { intent, subject, notes }, cites: [] };

  if (intent === 'people') {
    const { primary, others } = await wikiDisambiguate(subject);
    if (others?.length) out.candidates = others;

    if (primary && nameScore(subject, primary.title) >= 0.85) {
      out.profile = primary;
      const wd = await getWikidataSocials(primary.title);
      const s = await findSocialLinks(primary.title);

      const prelim: Cite[] = [];
      const push = (u?:string,t?:string,sn?:string)=>u && prelim.push({ id:String(prelim.length+1), url:norm(u), title:t||u, snippet:sn });
      if (primary.pageUrl) push(primary.pageUrl, 'Wikipedia');
      if (wd.website)  push(wd.website, 'Official website');
      if (wd.linkedin) push(wd.linkedin, 'LinkedIn');
      if (wd.instagram)push(wd.instagram,'Instagram');
      if (wd.facebook) push(wd.facebook, 'Facebook');
      if (wd.x)        push(wd.x,        'X (Twitter)');
      const pick = (h?:any)=> h && push(h.url, h.title, h.snippet);
      pick(s.linkedin); pick(s.insta); pick(s.fb); pick(s.x);

      const web = await searchCSEMany([ primary.title, `${primary.title} biography`, `${primary.title} achievements`, `${primary.title} interview` ], 3);
      web.forEach(r=>push(r.url,r.title,r.snippet));
      const seen = new Set<string>(); out.cites = [];
      for (const c of prelim) { if (!seen.has(c.url)) { seen.add(c.url); out.cites.push({ ...c, id: String(out.cites.length+1) }); } if (out.cites.length>=10) break; }
      return out;
    }

    // No strong Wikipedia → Web fallback & social candidates
    const hits = await searchCSEMany([ subject, `${subject} linkedin`, `${subject} instagram`, `${subject} facebook`, `${subject} profile` ], 3);
    out.candidates = (out.candidates ?? []).concat(
      hits.slice(0,6).map(h => ({ title: h.title.replace(/\s*[-–|].*$/,''),
                                   description: h.snippet, image: undefined, url: h.url }))
    );
    out.cites = hits.slice(0,10).map((h,i)=>({ id:String(i+1), ...h }));
    out.status = out.cites.length ? 'web candidates' : 'ambiguous';
    return out;
  }

  if (intent === 'local') {
    if (!coords?.lat || !coords?.lon) return { ...out, plan:{...out.plan, needLocation:true}, status:'need_location' };
    const g = await geoapifyPlaces(subject, coords.lat, coords.lon, 6000);
    const o = await overpassPlaces(subject, coords.lat, coords.lon, 6000);
    const merged = [...g, ...o];
    return { ...out, places: merged, status: `local:${subject} (${merged.length} found)` };
  }

  // COMPANY / GENERAL
  {
    const web = await searchCSEMany([ subject, `${subject} official site`, `${subject} overview`, `${subject} directors`, `${subject} contact`, `${subject} review` ], 4);
    const seen = new Set<string>(); out.cites = [];
    for (const r of web) { if (!seen.has(r.url)) { seen.add(r.url); out.cites.push({ id:String(out.cites.length+1), url:r.url, title:r.title, snippet:r.snippet }); } if (out.cites.length>=10) break; }
    return out;
  }
}
