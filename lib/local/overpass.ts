import type { Place } from '../types';

const CATS: Record<string, { key: string; values: string[] }> = {
  lawyer: { key:'office', values:['lawyer'] },
  doctor: { key:'amenity', values:['doctors','clinic'] },
  hospital:{ key:'amenity', values:['hospital'] },
  dentist:{ key:'amenity', values:['dentist'] },
  pharmacy:{ key:'amenity', values:['pharmacy'] },
  restaurant:{ key:'amenity', values:['restaurant','fast_food','cafe'] },
  cafe:{ key:'amenity', values:['cafe'] },
  bank:{ key:'amenity', values:['bank'] },
  atm:{ key:'amenity', values:['atm'] },
};

function detect(q:string){
  const s=q.toLowerCase();
  if (/lawyer|attorney|advocate/.test(s)) return 'lawyer';
  for (const k of Object.keys(CATS)) if (s.includes(k)) return k;
  return null;
}

function hav(lat1:number, lon1:number, lat2:number, lon2:number){
  const R=6371000, toRad=(d:number)=>d*Math.PI/180, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const A=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(A));
}

export async function overpassPlaces(q:string, lat:number, lon:number, radius=6000): Promise<Place[]> {
  const cat = detect(q); if (!cat) return [];
  const tag=CATS[cat]; const around=`around:${Math.max(800,Math.min(15000,radius))},${lat},${lon}`;
  const clauses = tag.values.map(v=>`node[${tag.key}=${v}](${around});way[${tag.key}=${v}](${around});relation[${tag.key}=${v}](${around});`).join('\n');
  const ql = `[out:json][timeout:25];(${clauses});out center tags 80;`;
  const headers = { 'Content-Type':'text/plain','Accept':'application/json','User-Agent':'Wizkid/1.0 (+https://example.com/contact)' } as any;
  const eps = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
  ];
  for (const ep of eps) {
    try {
      const r = await fetch(ep,{ method:'POST', body: ql, headers, cache:'no-store' });
      if (r.ok) {
        const j:any = await r.json();
        const out:Place[]=[];
        for (const el of j.elements||[]) {
          const tags=el.tags||{}, c=el.center||{lat:el.lat,lon:el.lon}, name=tags.name||tags['name:en'];
          if (!name || !c?.lat || !c?.lon) continue;
          const addr=[tags['addr:housenumber'],tags['addr:street'],tags['addr:city']].filter(Boolean).join(' ');
          const d = hav(lat,lon,c.lat,c.lon);
          out.push({
            id:String(el.id), name, address: addr || undefined, lat:c.lat, lon:c.lon,
            distance_m: Math.round(d),
            phone:tags.phone||tags['contact:phone'],
            website:tags.website||tags['contact:website'],
            category: tags.amenity || tags.office,
            source:'osm', osmUrl:`https://www.openstreetmap.org/${el.type}/${el.id}`
          });
        }
        out.sort((a,b)=> (a.distance_m||0)-(b.distance_m||0));
        return out.slice(0,20);
      }
    } catch {}
  }
  return [];
}
