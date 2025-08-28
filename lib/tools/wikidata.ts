export async function getWikidataSocials(name: string): Promise<{ website?: string; linkedin?: string; instagram?: string; facebook?: string; x?: string; twitter?: string }> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1`;
    const search = await fetch(searchUrl);
    const searchJson: any = await search.json();
    const id = searchJson.search?.[0]?.id;
    if (!id) return {};
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
    const entResp = await fetch(entityUrl);
    const entJson: any = await entResp.json();
    const entity = entJson.entities?.[id];
    if (!entity) return {};
    const claims = entity.claims || {};
    const getStr = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value;
    const out: any = {};
    const website = getStr('P856'); if (website) out.website = website;
    const twitter = getStr('P2002'); if (twitter) { out.twitter = `https://x.com/${twitter}`; out.x = out.twitter; }
    const instagram = getStr('P2003'); if (instagram) out.instagram = `https://instagram.com/${instagram}`;
    const facebook = getStr('P2013'); if (facebook) out.facebook = `https://facebook.com/${facebook}`;
    const liPerson = getStr('P6634'); if (liPerson) out.linkedin = `https://www.linkedin.com/in/${liPerson}`;
    const liOrg = getStr('P4264'); if (!out.linkedin && liOrg) out.linkedin = `https://www.linkedin.com/company/${liOrg}`;
    return out;
  } catch {
    return {};
  }
}
