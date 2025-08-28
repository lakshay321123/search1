'use client';
import { useState, useRef, useMemo } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };

export default function Home() {
  const [query, setQuery] = useState('Amit Shah');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string|undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [profile, setProfile] = useState<Profile|undefined>();
  const [confidence, setConfidence] = useState<string|undefined>();
  const abortRef = useRef<AbortController|null>(null);

  const socialLinks = useMemo(() => {
    const get = (host: string) => cites.find(c => new URL(c.url).hostname.includes(host));
    const wiki = cites.find(c => c.url.includes('wikipedia.org')) || (profile?.wikiUrl ? { id: 'w', url: profile.wikiUrl, title: 'Wikipedia' } as any : undefined);
    const insta = get('instagram.com');
    const fb = get('facebook.com');
    const x = cites.find(c => c.url.includes('x.com') || c.url.includes('twitter.com'));
    return { wiki, insta, fb, x };
  }, [cites, profile]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setAnswer(''); setCites([]); setConfidence(undefined);
    setProfile(undefined); setStatus(''); abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;

    const resp = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, style: 'simple' }), signal: ac.signal,
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
          if (evt.event === 'cite') setCites(c => {
            const exists = c.some(x => x.url === evt.cite.url);
            return exists ? c : [...c, evt.cite];
          });
          if (evt.event === 'profile') setProfile(evt.profile);
          if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
        } catch {}
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
          placeholder="Ask about a person, e.g. 'Amit Shah'"
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30" type="submit">
          Ask
        </button>
      </form>

      {/* Hero */}
      {(profile?.image || profile?.title) && (
        <section className="flex items-center gap-4 mb-4">
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

      {/* Link buckets */}
      <section className="mt-4 grid gap-2 sm:grid-cols-2">
        {socialLinks.wiki && (
          <a className="block bg-white/5 p-3 rounded-xl" target="_blank" rel="noreferrer" href={socialLinks.wiki.url}>
            <div className="text-xs opacity-70">Wikipedia</div>
            <div className="font-semibold truncate">{socialLinks.wiki.title || 'Wikipedia'}</div>
          </a>
        )}
        {socialLinks.insta && (
          <a className="block bg-white/5 p-3 rounded-xl" target="_blank" rel="noreferrer" href={socialLinks.insta.url}>
            <div className="text-xs opacity-70">Instagram</div>
            <div className="font-semibold truncate">{socialLinks.insta.title || 'Instagram'}</div>
          </a>
        )}
        {socialLinks.fb && (
          <a className="block bg-white/5 p-3 rounded-xl" target="_blank" rel="noreferrer" href={socialLinks.fb.url}>
            <div className="text-xs opacity-70">Facebook</div>
            <div className="font-semibold truncate">{socialLinks.fb.title || 'Facebook'}</div>
          </a>
        )}
        {socialLinks.x && (
          <a className="block bg-white/5 p-3 rounded-xl" target="_blank" rel="noreferrer" href={socialLinks.x.url}>
            <div className="text-xs opacity-70">X / Twitter</div>
            <div className="font-semibold truncate">{socialLinks.x.title || 'X'}</div>
          </a>
        )}
      </section>

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
