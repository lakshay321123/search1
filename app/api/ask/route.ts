// app/api/ask/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AskRequest { query: string; style?: 'simple' | 'expert'; }

function enc(s: string) { return new TextEncoder().encode(s); }
function sse(write: (s: string) => void) {
  return (o: any) => write(`data: ${JSON.stringify(o)}\n\n`);
}
function rid() {
  // @ts-ignore
  return (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2);
}

export async function POST(req: Request) {
  const { query } = await req.json() as AskRequest;

  const stream = new ReadableStream({
    async start(controller) {
      const send = sse((s) => controller.enqueue(enc(s)));
      send({ event: 'status', msg: 'searching Wikipedia' });
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        let title: string | undefined;
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          title = searchData?.query?.search?.[0]?.title;
        }
        if (!title) {
          send({ event: 'status', msg: 'no results found' });
        } else {
          const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
          if (res.ok) {
            const data = await res.json();
            const text = data.extract || 'No summary available.';
            const cite = { id: '1', url: data.content_urls?.desktop?.page || '', title: data.title };
            send({ event: 'token', text });
            send({ event: 'cite', cite });
            send({
              event: 'final',
              snapshot: { id: rid(), markdown: text, cites: [cite], timeline: [], confidence: 'medium' }
            });
          } else {
            send({ event: 'status', msg: 'no results found' });
          }
        }
      } catch (err: any) {
        send({ event: 'status', msg: `error: ${err.message}` });
      }
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
