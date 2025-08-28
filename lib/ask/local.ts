import { searchNearbyOverpass } from '../local/overpass';
import { rid, streamPlain } from './utils';

export async function handleLocal(query: string, coords: { lat: number; lon: number }, send: (o: any) => void) {
  const { places, usedCategory } = await searchNearbyOverpass(query, coords.lat, coords.lon);
  send({ event: 'status', msg: `local:${usedCategory || 'unknown'}` });
  send({ event: 'places', places });
  if (places.length) {
    const line = `Top ${usedCategory || 'places'} near you: ${places
      .slice(0, 5)
      .map((p) => `${p.name} (${Math.round((p.distance_m || 0) / 100) / 10}km)`).join(', ')}. `;
    await streamPlain(send, line);
  } else {
    await streamPlain(
      send,
      `I couldn’t find ${usedCategory || 'relevant'} results near you. Try expanding the radius or a different term.`
    );
  }
  send({ event: 'final', snapshot: { id: rid(), markdown: '(streamed)', cites: [], timeline: [], confidence: places.length ? 'medium' : 'low' } });
}
