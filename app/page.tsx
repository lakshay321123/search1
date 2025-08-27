'use client';
import { useState, useRef } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string; quote?: string; published_at?: string };

export default function Home() {
  const [query, setQuery] = useState('What is Wizkid?');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string|undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [confidence, setConfidence] = useState<string|undefined>();
  const abortRef = useRef<AbortController|null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setAnswer('');
    setCites([]);
    setConfidence(undefined);
    setStatus('');
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const resp = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, depth: 'standard', style: 'simple' }),
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
          if (evt.event === 'token') setAnswer(a => a + evt.text);
          if (evt.event === 'cite') setCites(c => [...c, evt.cite]);
          if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
        } catch { /* noop */ }
      }
    }
  }

  return (
    <main>
      <h1 className="text-3xl font-bold mb-4">Wizkid</h1>
      <form onSubmit={ask} className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Ask anything..."
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30" type="submit">
          Ask
        </button>
      </form>

      {status && <div className="text-sm opacity-70 mb-2">{status}</div>}
      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[120px]">
        <div dangerouslySetInnerHTML={{ __html: answer.replaceAll('\n','<br/>') }} />
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
    </main>
  );
}
