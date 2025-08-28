import { recordClick } from '../../../lib/learn/domains';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (url) await recordClick(url);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
