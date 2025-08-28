import { preferEntity, avoidEntity } from '../../../lib/learn/entities';
import { recordShow } from '../../../lib/learn/domains';

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      query: string;
      subject?: string;
      vote: 'up' | 'down';
      reason?: 'wrong_person' | 'outdated' | 'low_quality' | 'not_local' | 'other';
      cites?: { url: string }[];
    };

    if (body.vote === 'up' && body.subject) await preferEntity(body.query, body.subject, 1);
    if (body.vote === 'down' && body.reason === 'wrong_person' && body.subject) await avoidEntity(body.query, body.subject, 2);

    if (body.cites?.length) await Promise.all(body.cites.map(c => recordShow(c.url)));

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
