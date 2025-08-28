export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { detectIntent } from '../../../lib/intent';
import { loadEntityBias } from '../../../lib/learn/entities';
import { handleLocal } from '../../../lib/ask/local';
import { handlePeople } from '../../../lib/ask/people';
import { handleGeneral } from '../../../lib/ask/general';
import { rid } from '../../../lib/ask/utils';

const enc = (s: string) => new TextEncoder().encode(s);
const sse = (write: (s: string) => void) => (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);

type Req = { query: string; subject?: string; coords?: { lat: number; lon: number }; style?: 'simple' | 'expert' };

export async function POST(req: Request) {
  const body = (await req.json()) as Req;
  const { query, subject, coords, style = 'simple' } = body; // style currently unused
  const workingQuery = query.trim();
  const bias = await loadEntityBias(workingQuery);

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));
      try {
        const intent = detectIntent(query);
        if (intent === 'local' && coords?.lat && coords?.lon) {
          await handleLocal(query, coords, send);
        } else {
          const askFor = (subject && subject.trim()) || workingQuery;
          if (intent === 'people') {
            await handlePeople({ query, workingQuery, askFor, bias, send });
          } else {
            await handleGeneral({ askFor, send });
          }
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        sse((s) => controller.enqueue(enc(s)))({ event: 'error', msg });
        sse((s) => controller.enqueue(enc(s)))({ event: 'final', snapshot: { id: rid(), markdown: msg, cites: [], timeline: [], confidence: 'low' } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
