export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function firstIp(h: Headers) {
  const xff = h.get('x-forwarded-for') || '';
  const ip = xff.split(',')[0]?.trim();
  return ip && ip !== '::1' ? ip : '';
}

async function ipLookup(ip?: string) {
  const targets = [
    ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/',
    ip ? `https://ipwho.is/${ip}` : 'https://ipwho.is/'
  ];
  for (const u of targets) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) continue;
      const j: any = await r.json();
      const lat = Number(j.latitude ?? j.lat), lon = Number(j.longitude ?? j.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, source: new URL(u).hostname };
    } catch {}
  }
  return null;
}

export async function GET(req: Request) {
  const ip = firstIp(req.headers);
  const loc = await ipLookup(ip);
  return Response.json({ ok: !!loc, coords: loc });
}
