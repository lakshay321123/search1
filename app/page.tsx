'use client';
import { useState, useRef } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Candidate = { title: string; description?: string; image?: string; url: string };
type Place = { id: string; name: string; type: string; address?: string; lat: number; lon: number; distance_m?: number; phone?: string; website?: string; osmUrl?: string };

export default function Home() {
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{lat:number, lon:number}|undefined>();
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string|undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [confidence, setConfidence] = useState<string|undefined>();
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController|null>(null);

  const looksLocal = (q:string) => /\bnear me\b|\bnearby\b/i.test(q);

  async function getCoordsOnce(ms = 4000): Promise<{lat:number, lon:number} | null> {
    if (!('geolocation' in navigator)) return null;
    return new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
      navigator.geolocation.getCurrentPosition(
        pos => { if (!done) { done = true; clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); } },
        ()   => { if (!done) { done = true; clearTimeout(timer); resolve(null); } },
        { enableHighAccuracy: true, maximumAge: 120000, timeout: ms }
      );
    });
  }

  function reset() { setAnswer(''); setCites([]); setCandidates([]); setPlaces([]); setConfidence(undefined); setStatus(undefined); }

  async function ask(e?: React.FormEvent, qOverride?: string) {
    if (e) e.preventDefault();
    if (busy) return;
    const q = (qOverride ?? query).trim();
    if (!q) return;
    setBusy(true);
    reset();

    let coordPayload = coords;
    if (!coordPayload && looksLocal(q)) {
      const c = await getCoordsOnce(4000);
      if (c) setCoords(c);
      coordPayload = c || undefined;
    }

    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const resp = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, coords: coordPayload }),
      signal: ac.signal
    }).catch(() => undefined);

    if (!resp?.ok || !resp.body) { setStatus('error'); setBusy(false); return; }

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
          if (evt.event === 'token') { if (typeof evt.text === 'string' && /\S/.test(evt.text)) setAnswer(a => a + evt.text); }
          if (evt.event === 'cite') setCites(c => c.some(x => x.url === evt.cite.url) ? c : [...c, evt.cite]);
          if (evt.event === 'candidates') setCandidates(evt.candidates || []);
          if (evt.event === 'places') setPlaces(evt.places || []);
          if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
        } catch {}
      }
    }
    setBusy(false);
  }

  const openLink = (url: string) => window.open(url, '_blank', 'noreferrer');

  return (
    <main className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={()=>{ setQuery(''); reset(); }} className="text-3xl font-bold hover:opacity-80">Wizkid</button>
        <button
          onClick={() => navigator.geolocation?.getCurrentPosition(
            pos => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => setStatus('location permission denied')
          )}
          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm"
        >
          {coords ? 'Location ✓' : 'Use my location'}
        </button>
      </div>

      <form onSubmit={ask} className="flex gap-2 mb-2">
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Ask anything… e.g., “doctors near me”, “amit shah”, “CLS Foods India Private Limited”"
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-50" disabled={busy} type="submit">
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {!!candidates.length && (
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

      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[140px]">
        {status && <div className="text-xs opacity-70 mb-2">{status}</div>}
        <div dangerouslySetInnerHTML={{ __html: (answer || '').replaceAll('\n','<br/>') }} />
        {confidence && <div className="mt-3 text-sm">Confidence: <span className="font-semibold">{confidence}</span></div>}
      </article>

      {!!places.length && (
        <section className="mt-4">
          <div className="text-sm opacity-80 mb-1">Nearby</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {places.map(p => (
              <a key={p.id} href={p.osmUrl} target="_blank" rel="noreferrer" className="block bg-white/5 p-4 rounded-xl hover:bg-white/10 transition">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs opacity-80">{p.type}{p.address ? ` • ${p.address}` : ''}</div>
                <div className="text-xs opacity-70 mt-1">
                  {p.distance_m != null ? `${Math.round(p.distance_m/100)/10} km` : ''} {p.phone ? `• ${p.phone}` : ''} {p.website ? `• ${new URL(p.website).hostname}` : ''}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {!!cites.length && (
        <aside className="mt-6 grid gap-3 sm:grid-cols-2">
          {cites.map(c => (
            <a key={c.id} href={c.url} onClick={(e)=>{ e.preventDefault(); openLink(c.url); }} className="block bg-white/5 p-4 rounded-xl hover:bg-white/10 transition">
              <div className="text-sm opacity-70">Source {c.id}</div>
              <div className="font-semibold line-clamp-2">{c.title}</div>
              {c.snippet && <div className="text-sm opacity-80 mt-1">{c.snippet}</div>}
            </a>
          ))}
        </aside>
      )}
    </main>
  );
}
