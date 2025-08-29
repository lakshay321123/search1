export async function ipLocate(): Promise<{lat:number, lon:number} | null> {
  const targets = [
    'https://ipapi.co/json/',
    'https://ipwho.is/'
  ];
  for (const u of targets) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) continue;
      const j: any = await r.json();
      const lat = Number(j.latitude ?? j.lat), lon = Number(j.longitude ?? j.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    } catch {}
  }
  return null;
}
