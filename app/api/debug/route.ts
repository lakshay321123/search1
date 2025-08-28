export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return Response.json({
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GOOGLE_CSE_ID: !!process.env.GOOGLE_CSE_ID,
    GOOGLE_CSE_KEY: !!process.env.GOOGLE_CSE_KEY,
    UPSTASH_REDIS: !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  });
}
