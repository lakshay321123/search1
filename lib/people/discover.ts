import { wikiDisambiguate, type WikiCandidate, type WikiProfile } from '../wiki';
import { getWikidataSocials } from '../tools/wikidata';
import { findSocialLinks, searchCSE } from '../tools/googleCSE';
import { fetchOpenGraph } from '../tools/opengraph';
import { wikiPageviews60d } from '../tools/pageviews';
import { csePeopleCandidates } from './cseCandidates';
import { isConfidentMatch, nameScore } from '../text/similarity';

export type PersonCard = {
  name: string; description?: string; wikiUrl?: string; image?: string;
  socials: { wiki?: string; linkedin?: string; instagram?: string; facebook?: string; x?: string; website?: string };
  fameScore: number;  // for ranking only
};

function toCard(p: WikiProfile | WikiCandidate): PersonCard {
  return { name: p.title, description: (p as any).description, wikiUrl: (p as any).pageUrl, image: (p as any).image, socials: {}, fameScore: 0 };
}

/**
 * Combine Wikipedia and CSE-derived person candidates.
 * Rank by: name similarity (strong), + pageviews, + social presence.
 * Only select a primary if the top candidate is a CONFIDENT match.
 */
export async function discoverPeople(query: string): Promise<{ primary: PersonCard | null; others: PersonCard[] }> {
  const { primary, others } = await wikiDisambiguate(query);
  const cards: PersonCard[] = [];
  if (primary) cards.push(toCard(primary));
  for (const o of others) cards.push(toCard(o));

  // Add CSE-based candidates (LinkedIn/IG/FB/X)
  const cse = await csePeopleCandidates(query, 4);
  for (const c of cse) {
    // skip if same name+domain already present
    if (cards.some(k => k.name.toLowerCase() === c.name.toLowerCase())) continue;
    cards.push({ name: c.name, socials: { }, fameScore: 0, description: undefined, wikiUrl: undefined, image: c.image });
  }

  // Enrich & score
  await Promise.all(cards.map(async (c) => {
    // socials via Wikidata & CSE fallback
    const wd = await getWikidataSocials(c.name);
    c.socials = { website: wd.website, linkedin: wd.linkedin, instagram: wd.instagram, facebook: wd.facebook, x: wd.x || wd.twitter, wiki: c.wikiUrl };

    const socials = await findSocialLinks(c.name);
    c.socials.linkedin ||= socials.linkedin?.url;
    c.socials.instagram ||= socials.insta?.url;
    c.socials.facebook ||= socials.fb?.url;
    c.socials.x ||= socials.x?.url;
    c.socials.wiki ||= socials.wiki?.url;

    // photo via OG if missing
    if (!c.image && c.socials.linkedin) c.image = (await fetchOpenGraph(c.socials.linkedin))?.image || c.image;
    if (!c.image && c.socials.instagram) c.image = (await fetchOpenGraph(c.socials.instagram))?.image || c.image;

    const pv = c.wikiUrl ? await wikiPageviews60d(new URL(c.wikiUrl).pathname.split('/').pop()!) : 0;
    const socialW = (c.socials.linkedin?3:0)+(c.socials.instagram?2:0)+(c.socials.facebook?1:0)+(c.socials.x?2:0);
    const pulse = (await searchCSE(`"${c.name}"`, 2)).length;

    // Name similarity is the dominant factor
    const sim = nameScore(query, c.name);
    c.fameScore = sim*10000 + pv + socialW*100 + pulse*50;
  }));

  // Rank by combined score
  cards.sort((a,b)=>b.fameScore - a.fameScore);

  // Decide primary
  const top = cards[0];
  const confident = top ? isConfidentMatch(query, top.name) : false;

  if (!confident) {
    // No auto-pick; return top 6 as candidates
    return { primary: null, others: cards.slice(0, 6) };
  }

  return { primary: top, others: cards.filter(c => c !== top).slice(0, 6) };
}
