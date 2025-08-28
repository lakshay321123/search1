import { wikiDisambiguate, type WikiCandidate, type WikiProfile } from '../wiki';
import { getWikidataSocials } from '../tools/wikidata';
import { findSocialLinks, searchCSE } from '../tools/googleCSE';
import { fetchOpenGraph } from '../tools/opengraph';
import { wikiPageviews60d } from '../tools/pageviews';

export type PersonCard = {
  name: string; description?: string; wikiUrl?: string; image?: string;
  socials: { wiki?: string; linkedin?: string; instagram?: string; facebook?: string; x?: string; website?: string };
  fameScore: number;
};
function toCard(p: WikiProfile | WikiCandidate): PersonCard {
  return { name: p.title, description: (p as any).description, wikiUrl: (p as any).pageUrl, image: (p as any).image, socials: {}, fameScore: 0 };
}

export async function discoverPeople(q: string) {
  const { primary, others } = await wikiDisambiguate(q);
  const base: PersonCard[] = []; if (primary) base.push(toCard(primary)); for (const o of others) base.push(toCard(o));

  await Promise.all(base.map(async (c) => {
    const wd = await getWikidataSocials(c.name);
    c.socials = { website: wd.website, linkedin: wd.linkedin, instagram: wd.instagram, facebook: wd.facebook, x: wd.x || wd.twitter, wiki: c.wikiUrl };

    const socials = await findSocialLinks(c.name);
    c.socials.linkedin ||= socials.linkedin?.url; c.socials.instagram ||= socials.insta?.url;
    c.socials.facebook ||= socials.fb?.url; c.socials.x ||= socials.x?.url; c.socials.wiki ||= socials.wiki?.url;

    if (!c.image && c.socials.linkedin) c.image = (await fetchOpenGraph(c.socials.linkedin))?.image || c.image;
    if (!c.image && c.socials.instagram) c.image = (await fetchOpenGraph(c.socials.instagram))?.image || c.image;

    const pv = c.wikiUrl ? await wikiPageviews60d(new URL(c.wikiUrl).pathname.split('/').pop()!) : 0;
    const socialW = (c.socials.linkedin?3:0)+(c.socials.instagram?2:0)+(c.socials.facebook?1:0)+(c.socials.x?2:0);
    const pulse = (await searchCSE(`"${c.name}"`, 3)).length;
    c.fameScore = pv + socialW*100 + pulse*50;
  }));

  base.sort((a,b)=>b.fameScore - a.fameScore);
  return { primary: base[0], others: base.slice(1, 6) };
}
