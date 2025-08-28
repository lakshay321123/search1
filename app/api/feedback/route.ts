import { Redis } from '@upstash/redis';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { query: string; helpful: boolean };
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      await redis.lpush('feedback', JSON.stringify({ ...body, ts: Date.now() }));
      console.log('stored: redis');
    } else {
      console.log('stored:', body);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false }, { status: 200 });
  }
}
