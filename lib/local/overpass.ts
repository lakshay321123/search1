import type { Place } from '../types';

const CATS: Record<string, { key: string; values: string[] }> = {
  doctor:   { key: 'amenity', values: ['doctors', 'clinic'] },
  hospital: { key: 'amenity', values: ['hospital'] },
  dentist:  { key: 'amenity', values: ['dentist'] },
  pharmacy: { key: 'amenity', values: ['pharmacy'] },
  restaurant: { key: 'amenity', values: ['restaurant', 'fast_food', 'cafe'] },
  cafe: { key: 'amenity', values: ['cafe'] },
  bank: { key: 'amenity', values: ['bank'] },
  atm: { key: 'amenity', values: ['atm'] }
};

function detectCategory(q: string): keyof typeof CATS | null {
  const s = q.toLowerCase();
  for (const k of Object.keys(CATS)) if (s.includes(k)) return k as any;
  if (/doctor|clinic|gp|physician/.test(s)) return 'doctor';
  if (/dentist/.test(s)) return 'dentist';
  if (/hospital/.test(s)) return 'hospital';
  if (/pharmacy|chemist/.test(s)) return 'pharmacy';
  if (/restaurant|food|eat|dinner|lunch/.test(s)) return 'restaurant';
  if (/cafe|coffee/.test(s)) return 'cafe';
  if (/bank/.test(s)) return 'bank';
  if (/\batm\b/.test(s)) return 'atm';
  return null;
}

function haversine(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R=6371000, toRad=(d:number)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

export async function searchNearbyOverpass(q: string, lat: number, lon: number, radiusMeters = 4000): Promise<{ places: Place[], usedCategory: string | null }> {
  const cat = detectCategory(q);
  if (!cat) return { places: [], usedCategory: null };
  const tag = CATS[cat];
  // Overpass QL
  const around = `around:${Math.max(500, Math.min(10000, radiusMeters))},${lat},${lon}`;
  const clauses = tag.values.map(v => `node[${tag.key}=${v}](${around});way[${tag.key}=${v}](${around});relation[${tag.key}=${v}](${around});`).join('\n');
  const ql = `[out:json][timeout:25];(${clauses});out center tags 40;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: ql, headers: { 'Content-Type': 'text/plain' }, cache: 'no-store' });
  if (!r.ok) return { places: [], usedCategory: cat };
  const j: any = await r.json();
  const out: Place[] = [];
  for (const el of j.elements || []) {
    const tags = el.tags || {};
    const name: string = tags.name || tags['name:en'] || '';
    const center = el.center || { lat: el.lat, lon: el.lon };
    if (!center?.lat || !center?.lon || !name) continue;
    const addr = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
    const website = tags.website || tags['contact:website'];
    const phone = tags.phone || tags['contact:phone'];
    const dist = haversine(lat, lon, center.lat, center.lon);
    out.push({ id: String(el.id), name, address: addr || undefined, lat: center.lat, lon: center.lon, website, phone, distance_m: Math.round(dist), source: 'osm' });
  }
  out.sort((a,b)=> (a.distance_m||0) - (b.distance_m||0));
  return { places: out.slice(0, 12), usedCategory: cat };
}
