export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GOOGLE_CSE_ID: !!process.env.GOOGLE_CSE_ID,
    GOOGLE_CSE_KEY: !!process.env.GOOGLE_CSE_KEY
  });
}
