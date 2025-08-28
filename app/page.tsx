'use client';
import { useState, useRef } from 'react';

import type { Cite } from '../lib/types';

type Candidate = { title: string; description?: string; image?: string; url?: string };
type Profile = { title: string; description?: string; image?: string; wikiUrl?: string; socials?: Record<string, string | undefined> };
type Related = { label: string; prompt: string };

export default function Home() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [confidence, setConfidence] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const q = override ?? query;
    setQuery(q);
    setAnswer('');
    setCites([]);
    setConfidence(undefined);
    setStatus('');
    setCandidates([]);
    setProfile(null);
    setRelated([]);
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const resp = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
      signal: ac.signal,
    });

    if (!resp.ok || !resp.body) {
      setStatus('error');
      setLoading(false);
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
          if (evt.event === 'final') { setConfidence(evt.snapshot.confidence); setLoading(false); }
          if (evt.event === 'error') { setStatus('error'); setLoading(false); }
          if (evt.event === 'candidates') setCandidates(evt.candidates);
          if (evt.event === 'profile') setProfile(evt.profile);
          if (evt.event === 'related') setRelated(evt.items);
        } catch { /* noop */ }
      }
    }
  }

  const askWith = (q: string) => ask(undefined, q);

  return (
    <main className="max-w-4xl mx-auto px-4 pt-4 pb-40">
      <form onSubmit={e => ask(e)} className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Search people..."
          disabled={loading}
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-50" type="submit" disabled={loading}>
          Ask
        </button>
      </form>

      {candidates.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {candidates.map(c => (
            <button key={c.title} onClick={() => askWith(c.title)} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-sm">
              {c.title}
            </button>
          ))}
        </div>
      )}

      {profile && (
        <div className="mb-4 flex items-center gap-4">
          {profile.image && <img src={profile.image} alt={profile.title} className="w-24 h-24 rounded-full object-cover" />}
          <div>
            <div className="text-xl font-semibold">{profile.title}</div>
            {profile.description && <div className="text-sm opacity-80">{profile.description}</div>}
            {profile.socials && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {profile.socials.wiki && <a className="text-xs px-2 py-1 rounded bg-white/10" href={profile.socials.wiki} target="_blank">Wiki</a>}
                {profile.socials.linkedin && <a className="text-xs px-2 py-1 rounded bg-white/10" href={profile.socials.linkedin} target="_blank">LinkedIn</a>}
                {profile.socials.instagram && <a className="text-xs px-2 py-1 rounded bg-white/10" href={profile.socials.instagram} target="_blank">Instagram</a>}
                {profile.socials.facebook && <a className="text-xs px-2 py-1 rounded bg-white/10" href={profile.socials.facebook} target="_blank">Facebook</a>}
                {profile.socials.x && <a className="text-xs px-2 py-1 rounded bg-white/10" href={profile.socials.x} target="_blank">X</a>}
              </div>
            )}
          </div>
        </div>
      )}

      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[120px]">
        <div dangerouslySetInnerHTML={{ __html: answer.split('\n').join('<br/>') }} />
      </article>
      {confidence && (
        <div className="mt-2 text-sm">Confidence: <span className="font-semibold">{confidence}</span></div>
      )}

      {related.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {related.map(r => (
            <button key={r.prompt} onClick={() => askWith(r.prompt)} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-sm">
              {r.label}
            </button>
          ))}
        </div>
      )}

      {!!cites.length && (
        <aside className="mt-6 grid gap-3 sm:grid-cols-2">
          {cites.map(c => (
            <a
              key={c.id}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="block bg-white/5 p-4 rounded-xl hover:bg-white/10 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm opacity-70">Source {c.id}</div>
                <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                  {(() => { try { return new URL(c.url).hostname.replace(/^www\./,''); } catch { return ''; } })()}
                </div>
              </div>
              <div className="font-semibold line-clamp-2">{c.title}</div>
              {c.snippet && (
                <div className="text-sm opacity-80 mt-1 line-clamp-3">{c.snippet}</div>
              )}
            </a>
          ))}
        </aside>
      )}

      {status && <div className="mt-4 text-sm opacity-70">{status}</div>}
    </main>
  );
}
