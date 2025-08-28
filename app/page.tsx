'use client';
import { useState, useRef, useEffect } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string; quote?: string; published_at?: string };
type AskRequest = { query: string; style: 'simple' | 'expert' };

export default function Home() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [confidence, setConfidence] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const [bg, setBg] = useState('https://source.unsplash.com/1600x900/?ai');

  useEffect(() => {
    const id = setInterval(() => {
      setBg(`https://source.unsplash.com/1600x900/?ai&sig=${Date.now()}`);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setAnswer('');
    setCites([]);
    setConfidence(undefined);
    setStatus('');
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const payload: AskRequest = { query, style: 'simple' };
    const resp = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    if (!resp.ok || !resp.body) {
      setStatus('error');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const chunk of parts) {
        if (!chunk.startsWith('data:')) continue;
        const json = chunk.slice(5).trim();
        try {
          const evt = JSON.parse(json);
          if (evt.event === 'status') setStatus(evt.msg);
          if (evt.event === 'error') setStatus(`error: ${evt.msg}`);
          if (evt.event === 'token') setAnswer(a => a + evt.text);
          if (evt.event === 'cite') setCites(c => [...c, evt.cite]);
          if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
        } catch { /* noop */ }
      }
    }
  }

  return (
    <main className="relative min-h-screen pb-40">
      <div className="absolute inset-x-0 top-0 h-1/2 -z-10 overflow-hidden">
        <img src={bg} alt="ai background" className="w-full h-full object-cover opacity-40 transition-opacity duration-1000" />
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        {status && <div className="text-sm opacity-70 mb-2">{status}</div>}
        <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[120px]">
          <div dangerouslySetInnerHTML={{ __html: answer.replaceAll('\n', '<br/>') }} />
        </article>

        {confidence && (
          <div className="mt-2 text-sm">Confidence: <span className="font-semibold">{confidence}</span></div>
        )}

        {!!cites.length && (
          <aside className="mt-6 grid gap-3 sm:grid-cols-2">
            {cites.map(c => (
              <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="block bg-white/5 p-4 rounded-xl">
                <div className="text-sm opacity-70">Source {c.id}</div>
                <div className="font-semibold line-clamp-2">{c.title}</div>
                {c.snippet && <div className="text-sm opacity-80 mt-1 line-clamp-3">{c.snippet}</div>}
                {c.quote && <div className="text-xs opacity-70 mt-2 italic">“{c.quote}”</div>}
              </a>
            ))}
          </aside>
        )}
      </div>

      <form onSubmit={ask} className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-2 w-full max-w-xl px-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Ask anything..."
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30" type="submit">
          Ask
        </button>
      </form>
    </main>
  );
}
