export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(()=>({}));
  const { query, helpful, reason } = body || {};
  const payload = { ts: Date.now(), query, helpful: !!helpful, reason: reason || null };

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      await fetch(`${url}/hset/wizkid:feedback:${Date.now()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return Response.json({ ok: true, stored: 'redis' });
    } catch {}
  }
  console.log('FEEDBACK', payload);
  return Response.json({ ok: true, stored: 'console' });
}
