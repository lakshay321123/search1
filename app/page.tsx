'use client';
import { useState, useRef } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };
type Candidate = { title: string; description?: string; image?: string; url: string };
type RelatedItem = { label: string; prompt: string };

export default function Home() {
  const [query, setQuery] = useState('Amit Shah');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string|undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [profile, setProfile] = useState<Profile|undefined>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [confidence, setConfidence] = useState<string|undefined>();
  const abortRef = useRef<AbortController|null>(null);

  async function ask(e?: React.FormEvent, qOverride?: string) {
    if (e) e.preventDefault();
    const q = qOverride ?? query;

    setAnswer(''); setCites([]); setConfidence(undefined);
    setProfile(undefined); setCandidates([]); setRelated([]);
    setStatus(''); abortRef.current?.abort();

    const ac = new AbortController(); abortRef.current = ac;
    const resp = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, style: 'simple' }), signal: ac.signal,
    });
    if (!resp.ok || !resp.body) { setStatus('error'); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n'); buffer = parts.pop() || '';
      for (const chunk of parts) {
        if (!chunk.startsWith('data:')) continue;
        const json = chunk.slice(5).trim();
        try {
          const evt = JSON.parse(json);
          if (evt.event === 'status') setStatus(evt.msg);
          if (evt.event === 'token') setAnswer(a => a + evt.text);
          if (evt.event === 'cite') setCites(c => c.some(x => x.url === evt.cite.url) ? c : [...c, evt.cite]);
          if (evt.event === 'profile') setProfile(evt.profile);
          if (evt.event === 'candidates') setCandidates(evt.candidates || []);
          if (evt.event === 'related') setRelated(evt.items || []);
          if (evt.event === 'error') setStatus(`error: ${evt.msg}`);
          if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
        } catch {}
      }
    }
  }

  return (
    <main>
      <h1 className="text-3xl font-bold mb-4">Wizkid</h1>
      <form onSubmit={ask} className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Ask about a person, e.g. 'Amit Shah'"
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30" type="submit">
          Ask
        </button>
      </form>

      {/* Did you mean… (alternates) */}
      {candidates.length > 0 && (
        <div className="mb-3">
          <div className="text-sm opacity-80 mb-1">Did you mean:</div>
          <div className="flex flex-wrap gap-2">
            {candidates.map(c => (
              <button key={c.title}
                onClick={() => { setQuery(c.title); ask(undefined, c.title); }}
                className="px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20">
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero */}
      {(profile?.image || profile?.title) && (
        <section className="flex items-center gap-4 mb-3">
          {profile?.image && <img src={profile.image} alt={profile?.title || 'profile'} className="w-16 h-16 rounded-xl object-cover" />}
          <div>
            <div className="text-xl font-semibold">{profile?.title || query}</div>
            {profile?.description && <div className="text-sm opacity-80">{profile.description}</div>}
          </div>
        </section>
      )}

      {/* Streaming summary */}
      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[140px]">
        {status && <div className="text-xs opacity-70 mb-2">{status}</div>}
        <div dangerouslySetInnerHTML={{ __html: (answer || '').replaceAll('\n','<br/>') }} />
        {confidence && <div className="mt-3 text-sm">Confidence: <span className="font-semibold">{confidence}</span></div>}
      </article>

      {/* Related questions */}
      {related.length > 0 && (
        <div className="mt-3">
          <div className="text-sm opacity-80 mb-1">Related</div>
          <div className="flex flex-wrap gap-2">
            {related.map(r => (
              <button key={r.prompt}
                onClick={() => { setQuery(r.prompt); ask(undefined, r.prompt); }}
                className="px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20">
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sources grid */}
      {!!cites.length && (
        <aside className="mt-6 grid gap-3 sm:grid-cols-2">
          {cites.map(c => (
            <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="block bg-white/5 p-4 rounded-xl">
              <div className="text-sm opacity-70">Source {c.id}</div>
              <div className="font-semibold line-clamp-2">{c.title}</div>
              {c.snippet && <div className="text-sm opacity-80 mt-1 line-clamp-3">{c.snippet}</div>}
            </a>
          ))}
        </aside>
      )}
    </main>
  );
}
