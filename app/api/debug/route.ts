export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasCSEId: !!process.env.GOOGLE_CSE_ID,
    hasCSEKey: !!process.env.GOOGLE_CSE_KEY
  });
}

