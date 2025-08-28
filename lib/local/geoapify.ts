import type { Place } from '../types';

export async function searchNearbyGeoapify(q: string, lat: number, lon: number, limit = 12): Promise<Place[]> {
  const key = process.env.GEOAPIFY_KEY;
  if (!key) return [];
  try {
    const url = new URL('https://api.geoapify.com/v2/places');
    url.searchParams.set('text', q);
    url.searchParams.set('bias', `proximity:${lon},${lat}`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('lang', 'en');
    url.searchParams.set('apiKey', key);
    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) return [];
    const j: any = await r.json();
    const out: Place[] = [];
    for (const f of j.features || []) {
      const p = f.properties || {};
      out.push({
        id: String(f.id || p.place_id || out.length + 1),
        name: p.name || p.address_line1 || 'unknown',
        address: p.formatted || p.address_line1,
        lat: f.geometry?.coordinates?.[1],
        lon: f.geometry?.coordinates?.[0],
        distance_m: p.distance,
        phone: p.contact?.phone,
        website: p.website,
        source: 'geoapify'
      });
    }
    return out;
  } catch {
    return [];
  }
}
