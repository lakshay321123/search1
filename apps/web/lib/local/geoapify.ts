import type { Place } from '../types';

const KEY = process.env.GEOAPIFY_KEY || '';

function hav(lat1:number, lon1:number, lat2:number, lon2:number){
  const R=6371000, toRad=(d:number)=>d*Math.PI/180, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const A=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(A));
}

export async function geoapifyPlaces(q: string, lat:number, lon:number, radius=6000): Promise<Place[]> {
  if (!KEY) return [];
  let cats:string[]=[];
  const s=q.toLowerCase();
  if (s.includes('lawyer') || s.includes('attorney') || s.includes('advocate')) cats=['service.lawyer'];
  if (s.includes('doctor') || s.includes('clinic') || s.includes('physician')) cats=['healthcare.doctor','healthcare.clinic'];
  if (s.includes('hospital')) cats=['healthcare.hospital'];
  if (s.includes('dentist')) cats=['healthcare.dentist'];
  if (s.includes('pharmacy')) cats=['healthcare.pharmacy'];
  if (s.includes('restaurant')) cats=['catering.restaurant','catering.fast_food','catering.cafe'];
  if (s.includes('cafe')) cats=['catering.cafe'];
  if (s.includes('bank')) cats=['financial.bank'];
  if (s.includes('atm')) cats=['financial.atm'];

  const u = new URL('https://api.geoapify.com/v2/places');
  u.searchParams.set('apiKey', KEY);
  u.searchParams.set('filter', `circle:${lon},${lat},${Math.max(800, Math.min(15000, radius))}`);
  u.searchParams.set('bias', `proximity:${lon},${lat}`);
  if (cats.length) u.searchParams.set('categories', cats.join(','));
  else u.searchParams.set('text', q);
  u.searchParams.set('limit', '20');

  const r = await fetch(u, { cache:'no-store' });
  if (!r.ok) return [];
  const j:any = await r.json();

  return (j.features||[]).map((f:any)=> {
    const p=f.properties||{}, g=f.geometry?.coordinates||[lon,lat];
    const d = hav(lat,lon,g[1],g[0]);
    return {
      id: String(f.id || `${g[1]},${g[0]}`),
      name: p.name || p.address_line1 || 'Unknown',
      address: p.formatted,
      lat: g[1], lon: g[0], distance_m: Math.round(d),
      phone: p.datasource?.raw?.phone || p.contact?.phone,
      website: p.website || p.datasource?.raw?.website,
      category: (p.categories||[])[0],
      source: 'geoapify' as const
    };
  });
}
