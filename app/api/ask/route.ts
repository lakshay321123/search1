export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { query, style = 'simple' } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ event: 'status', msg: 'searching' });

      // Perform search using a generic search API (e.g., Tavily)
      let results: any[] = [];
      try {
        const searchRes = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SEARCH_API_KEY ?? ''}`
          },
          body: JSON.stringify({ query, max_results: 3 })
        });
        const data = await searchRes.json();
        results = data.results || [];
      } catch (err) {
        send({ event: 'status', msg: 'search_failed' });
      }

      // Fetch page content for each result and emit cites
      const cites: any[] = [];
      for (const [i, r] of results.entries()) {
        try {
          const res = await fetch(r.url);
          const html = await res.text();
          const snippet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
          const cite = { id: String(i + 1), url: r.url, title: r.title || '', snippet };
          cites.push(cite);
          send({ event: 'cite', cite });
        } catch {
          // ignore individual failures
        }
      }

      send({ event: 'status', msg: 'answering' });

      // Build prompt for the LLM using collected citations
      const prompt = `${style === 'expert' ? 'Provide an expert answer.' : 'Provide a concise answer.'}\nQuestion: ${query}\n\nSources:\n${cites.map(c => `[${c.id}] ${c.url}`).join('\n')}`;

      // Stream response from LLM (e.g., OpenAI)
      let fullText = '';
      try {
        const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LLM_API_KEY ?? ''}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            stream: true,
            messages: [
              { role: 'system', content: 'You are a helpful assistant that cites sources.' },
              { role: 'user', content: prompt }
            ]
          })
        });

        const reader = llmRes.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let done = false;
          while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n').filter(Boolean);
              for (const line of lines) {
                const msg = line.replace(/^data: /, '');
                if (msg === '[DONE]') {
                  done = true;
                  break;
                }
                try {
                  const data = JSON.parse(msg);
                  const token = data.choices?.[0]?.delta?.content;
                  if (token) {
                    fullText += token;
                    send({ event: 'token', text: token });
                  }
                } catch {
                  // ignore malformed lines
                }
              }
            }
          }
        }
      } catch (err) {
        send({ event: 'status', msg: 'llm_failed' });
      }

      // unique id
      const id = (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || Math.random().toString(36).slice(2);
      const markdown = (style === 'expert' ? '**Answer (Expert):** ' : '**Answer:** ') + fullText.trim();
      send({ event: 'final', snapshot: { id, markdown, cites, timeline: [], confidence: 'unknown' } });
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
