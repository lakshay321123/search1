export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    GOOGLE_CSE_ID: !!process.env.GOOGLE_CSE_ID,
    GOOGLE_CSE_KEY: !!process.env.GOOGLE_CSE_KEY,
    GEOAPIFY_KEY: !!process.env.GEOAPIFY_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || null,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    UPSTASH_REDIS: !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  });
}
