'use client';
import { useEffect, useRef, useState } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };
type Candidate = { title: string; description?: string; image?: string; url: string };
type Place = { id: string; name: string; address?: string; lat: number; lon: number; distance_m?: number; phone?: string; website?: string; source?: string };

function host(u: string) {
  try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; }
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [profile, setProfile] = useState<Profile>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [confidence, setConfidence] = useState<string>();
  const [usingLocation, setUsingLocation] = useState(false);
  const [coords, setCoords] = useState<{lat:number, lon:number}>();
  const [provider, setProvider] = useState<'auto'|'openai'|'gemini'>('auto');

  const abortRef = useRef<AbortController|null>(null);

  useEffect(() => {
    // If user clicks "Use my location", request once
    if (usingLocation && !coords) {
      if (!navigator.geolocation) {
        setStatus('Geolocation not available in this browser.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => setStatus(`Location error: ${err.message}`),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, [usingLocation, coords]);

  async function ask(e?: React.FormEvent, override?: string) {
    if (e) e.preventDefault();
    const q = (override ?? query).trim();
    if (!q) return;

    // reset UI
    setAnswer(''); setStatus(''); setCites([]); setProfile(undefined);
    setCandidates([]); setPlaces([]); setConfidence(undefined);
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;

    const body:any = { query: q, provider };
    if (usingLocation && coords) body.coords = coords;

    const resp = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal
    });

    if (!resp.ok || !resp.body) { setStatus('Request failed'); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n'); buffer = parts.pop() || '';
      for (const chunk of parts) {
        if (!chunk.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(chunk.slice(5).trim());
          if (evt.event === 'status') setStatus(evt.msg);
          if (evt.event === 'token') setAnswer(a => a + evt.text);
          if (evt.event === 'cite') setCites(c => c.some(x => x.url === evt.cite.url) ? c : [...c, evt.cite]);
          if (evt.event === 'profile') setProfile(evt.profile);
          if (evt.event === 'candidates') setCandidates(evt.candidates || []);
          if (evt.event === 'places') setPlaces(evt.places || []);
          if (evt.event === 'final') setConfidence(evt.snapshot?.confidence);
          if (evt.event === 'error') setStatus(`error: ${evt.msg}`);
        } catch {}
      }
    }
  }

  async function feedback(helpful: boolean) {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, helpful })
      });
    } catch {}
  }

  return (
    <main className="max-w-3xl mx-auto p-4">
      <header className="flex items-center justify-between mb-4">
        <button className="text-2xl font-bold" onClick={() => window.location.reload()}>Wizkid</button>
        <div className="flex gap-2">
          <select
            className="bg-white/10 rounded-xl px-3 py-2"
            value={provider}
            onChange={(e)=>setProvider(e.target.value as any)}
            title="LLM provider"
          >
            <option value="auto">Auto</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          <button
            onClick={() => setUsingLocation(x => !x)}
            className={`px-3 py-2 rounded-xl ${usingLocation ? 'bg-white/30' : 'bg-white/10'} hover:bg-white/20`}
            title="Toggle use my location"
          >
            {usingLocation ? 'Location ✓' : 'Use my location'}
          </button>
        </div>
      </header>

      <form onSubmit={ask} className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          placeholder="Ask anything (e.g., 'property lawyer near me', 'amit shah', 'pinch of yum oatmeal')"
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30" type="submit">Ask</button>
      </form>

      {/* Did you mean */}
      {candidates.length > 0 && (
        <div className="mb-3">
          <div className="text-sm opacity-80 mb-1">Did you mean:</div>
          <div className="flex flex-wrap gap-2">
            {candidates.map(c => (
              <button key={c.title}
                onClick={() => { setQuery(c.title); ask(undefined, c.title); }}
                className="px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20"
              >
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
            <div className="text-xl font-semibold">{profile?.title}</div>
            {profile?.description && <div className="text-sm opacity-80">{profile.description}</div>}
            <div className="mt-1 flex gap-2 text-xs">
              {profile?.wikiUrl && <a className="underline opacity-80" href={profile.wikiUrl} target="_blank">Wiki</a>}
            </div>
          </div>
        </section>
      )}

      {/* Streaming answer */}
      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[120px]">
        {status && <div className="text-xs opacity-70 mb-2">{status}</div>}
        <div dangerouslySetInnerHTML={{ __html: (answer || '').replaceAll('\n','<br/>') }} />
        {confidence && (
          <div className="mt-3 text-sm">
            Confidence: <span className="font-semibold">{confidence}</span>
            <span className="ml-3 inline-flex gap-2">
              <button onClick={()=>feedback(true)} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">👍</button>
              <button onClick={()=>feedback(false)} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">👎</button>
            </span>
          </div>
        )}
      </article>

      {/* Places (near me) */}
      {places.length > 0 && (
        <section className="mt-4 space-y-2">
          {places.map(p => (
            <div key={p.id} className="bg-white/5 p-4 rounded-xl">
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm opacity-80">{p.address}</div>
              <div className="text-sm opacity-80">
                {(p.distance_m!=null) ? `${Math.round(p.distance_m/100)/10} km` : ''} {p.phone ? ` • ${p.phone}` : ''} {p.website ? ' • ' : ''}
                {p.website && <a className="underline" href={p.website} target="_blank" rel="noreferrer">Website</a>}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Sources */}
      {!!cites.length && (
        <aside className="mt-6 grid gap-3 sm:grid-cols-2">
          {cites.map(c => (
            <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="block bg-white/5 p-4 rounded-xl">
              <div className="text-xs opacity-70">Source {c.id} • {host(c.url)}</div>
              <div className="font-semibold line-clamp-2">{c.title}</div>
              {c.snippet && <div className="text-sm opacity-80 mt-1 line-clamp-3">{c.snippet}</div>}
            </a>
          ))}
        </aside>
      )}
    </main>
  );
}
