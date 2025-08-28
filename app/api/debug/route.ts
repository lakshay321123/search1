export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    GEOAPIFY_KEY: !!process.env.GEOAPIFY_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    GOOGLE_CSE_ID: !!process.env.GOOGLE_CSE_ID,
    GOOGLE_CSE_KEY: !!process.env.GOOGLE_CSE_KEY,
    UPSTASH_REDIS: !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  });
}
