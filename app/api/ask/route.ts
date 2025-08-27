export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        send({ event: 'status', msg: 'planning' });

        let cites: any[] = [];
        try {
          // pretend search call which could fail
          cites = [
            {
              id: '1',
              url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events',
              title: 'MDN: Server-Sent Events',
              snippet: 'How SSE works.'
            },
            {
              id: '2',
              url: 'https://nextjs.org/docs/app/building-your-application/routing/route-handlers',
              title: 'Next.js Route Handlers',
              snippet: 'API routes in the App Router.'
            }
          ];
        } catch (err: any) {
          send({ event: 'status', msg: `search_error: ${err.message}` });
          controller.close();
          return;
        }

        let text = '';
        try {
          text =
            (style === 'expert' ? '**Answer (Expert):** ' : '**Answer:** ') +
            `Wizkid provides a sourced, concise summary to the query: "${query}". ` +
            'It streams tokens and shows citations that you can open.' +
            '\n\nKey points:\n- Citation-first answers.\n- Follow-ups supported.\n- Confidence badge.\n';

          for (const ch of Array.from(text)) {
            send({ event: 'token', text: ch });
            await sleep(5);
          }
        } catch (err: any) {
          send({ event: 'status', msg: `llm_error: ${err.message}` });
          controller.close();
          return;
        }

        for (const c of cites) send({ event: 'cite', cite: c });

      // unique id
      // @ts-ignore
      const id = (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2);
      send({ event: 'final', snapshot: { id, markdown: text, cites, timeline: [], confidence: 'high' } });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}
