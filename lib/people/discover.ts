import { wikiDisambiguate, type WikiCandidate, type WikiProfile } from '../wiki';
import { getWikidataSocials } from '../tools/wikidata';
import { findSocialLinks, searchCSE } from '../tools/googleCSE';
import { fetchOpenGraph } from '../tools/opengraph';
import { wikiPageviews60d } from '../tools/pageviews';

export type PersonCard = {
  name: string;
  description?: string;
  wikiUrl?: string;
  image?: string;
  socials: { wiki?: string; linkedin?: string; instagram?: string; facebook?: string; x?: string; website?: string };
  fameScore: number;
};

function toCard(primary: WikiProfile | WikiCandidate): PersonCard {
  return {
    name: primary.title,
    description: (primary as any).description,
    wikiUrl: (primary as any).pageUrl,
    image: (primary as any).image,
    socials: {},
    fameScore: 0
  };
}

export async function discoverPeople(q: string) {
  const { primary, others } = await wikiDisambiguate(q);
  const base: PersonCard[] = [];

  if (primary) base.push(toCard(primary));
  for (const o of others) base.push(toCard(o));

  // Enrich each candidate: socials via Wikidata, then CSE fallback; OG image fallback; fame score
  await Promise.all(base.map(async (c) => {
    const wd = await getWikidataSocials(c.name);
    c.socials = {
      website: wd.website,
      linkedin: wd.linkedin,
      instagram: wd.instagram,
      facebook: wd.facebook,
      x: wd.x || wd.twitter,
      wiki: c.wikiUrl
    };

    // Fallback via CSE if Wikidata missing
    if (!c.socials.linkedin || !c.socials.instagram || !c.socials.facebook || !c.socials.x) {
      const socials = await findSocialLinks(c.name);
      c.socials.linkedin ||= socials.linkedin?.url;
      c.socials.instagram ||= socials.insta?.url;
      c.socials.facebook ||= socials.fb?.url;
      c.socials.x ||= socials.x?.url;
      c.socials.wiki ||= socials.wiki?.url;
    }

    // Better image from OG if none from Wikipedia
    if (!c.image && c.socials.linkedin) {
      const og = await fetchOpenGraph(c.socials.linkedin);
      c.image = og?.image || c.image;
    }
    if (!c.image && c.socials.instagram) {
      const og = await fetchOpenGraph(c.socials.instagram);
      c.image = og?.image || c.image;
    }

    // Fame score: recent pageviews + social presence + general web mentions
    const pv = c.wikiUrl ? await wikiPageviews60d(new URL(c.wikiUrl).pathname.split('/').pop()!.replace(/_/g,' ')) : 0;
    const socialWeight =
      (c.socials.linkedin ? 3 : 0) +
      (c.socials.instagram ? 2 : 0) +
      (c.socials.facebook ? 1 : 0) +
      (c.socials.x ? 2 : 0);

    // quick web pulse (optional but cheap)
    const pulse = (await searchCSE(`"${c.name}"`, 3)).length;

    c.fameScore = pv * 1 + socialWeight * 100 + pulse * 50; // tune as you like
  }));

  // Rank most obvious person first
  base.sort((a,b) => b.fameScore - a.fameScore);

  return {
    primary: base[0],
    others: base.slice(1, 6) // show up to 5 more
  };
}
