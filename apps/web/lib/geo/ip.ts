export type Coords = { lat: number; lon: number };

export async function ipLocate(): Promise<Coords | null> {
  try {
    const r = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (r.ok) {
      const j: any = await r.json();
      const lat = Number(j.latitude), lon = Number(j.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  } catch {}
  try {
    const r = await fetch('https://ipwho.is/', { cache: 'no-store' });
    if (r.ok) {
      const j: any = await r.json();
      const lat = Number(j.latitude), lon = Number(j.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  } catch {}
  return null;
}
