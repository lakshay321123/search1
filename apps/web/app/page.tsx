'use client';
import { useRef, useState } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };
type Candidate = { title: string; description?: string; image?: string; url?: string; pageUrl?: string };
type RelatedItem = { label: string; prompt: string };
type Place = { id:string; name:string; address?:string; distance_m?:number; phone?:string; website?:string; osmUrl?:string; source:'geoapify'|'osm' };

export default function Page() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string|undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [profile, setProfile] = useState<Profile|undefined>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [confidence, setConfidence] = useState<string|undefined>();
  const [coords, setCoords] = useState<{lat:number,lon:number}|undefined>();
  const abortRef = useRef<AbortController|null>(null);

  function ask(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setAnswer(''); setCites([]); setConfidence(undefined);
    setProfile(undefined); setCandidates([]); setRelated([]); setPlaces([]);
    setStatus(''); abortRef.current?.abort();

    const ac = new AbortController(); abortRef.current = ac;
    fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, coords }),
      signal: ac.signal
    }).then(resp => {
      if (!resp.ok || !resp.body) { setStatus('error'); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder(); let buffer = '';
      (async function read() {
        const { done, value } = await reader.read(); if (done) return;
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
            if (evt.event === 'places') setPlaces(evt.places || []);
            if (evt.event === 'error') setStatus(`error: ${evt.msg}`);
            if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
          } catch {}
        }
        read();
      })();
    });
  }

  function useLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos)=> setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      ()=> setCoords(undefined),
      { enableHighAccuracy:true, timeout: 7000 }
    );
  }

  function sendFeedback(ok:boolean) {
    fetch('/api/feedback', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query, helpful: ok })});
  }

  return (
    <main className="mx-auto max-w-3xl p-5">
      <header className="flex items-center justify-between mb-4">
        <button onClick={()=>window.location.reload()} className="text-2xl font-bold">Wizkid</button>
        <div className="flex gap-2">
          <button onClick={useLocation} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">Location ✓</button>
        </div>
      </header>

      <form onSubmit={ask} className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Ask anything (e.g., “property lawyer near me”)"
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30" type="submit">
          Search
        </button>
      </form>

      {/* Did you mean… */}
      {candidates.length > 0 && (
        <div className="mb-3">
          <div className="text-sm opacity-80 mb-1">Did you mean:</div>
          <div className="flex flex-wrap gap-2">
            {candidates.map(c => (
              <button key={c.title}
                onClick={() => { setQuery(c.title); ask(); }}
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
            <div className="text-xl font-semibold">{profile?.title}</div>
            {profile?.description && <div className="text-sm opacity-80">{profile.description}</div>}
          </div>
        </section>
      )}

      {/* Streaming answer */}
      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[140px]">
        {status && <div className="text-xs opacity-70 mb-2">{status}</div>}
        <div dangerouslySetInnerHTML={{ __html: (answer || '').replaceAll('\n','<br/>') }} />
        {confidence && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            Confidence: <span className="font-semibold">{confidence}</span>
            <button onClick={()=>sendFeedback(true)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">👍</button>
            <button onClick={()=>sendFeedback(false)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">👎</button>
          </div>
        )}
      </article>

      {/* Places */}
      {!!places.length && (
        <div className="mt-4 grid gap-2">
          {places.map(p=>(
            <div key={p.id} className="bg-white/5 p-3 rounded-xl">
              <div className="font-semibold">{p.name}</div>
              {p.address && <div className="text-sm opacity-80">{p.address}</div>}
              <div className="text-xs opacity-70">
                {p.distance_m ? `${p.distance_m} m · ` : ''}{p.website ? <a className="underline" target="_blank" href={p.website}>Website</a> : null}
                {p.osmUrl ? <> · <a className="underline" target="_blank" href={p.osmUrl}>OpenStreetMap</a></> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-3">
          <div className="text-sm opacity-80 mb-1">Related</div>
          <div className="flex flex-wrap gap-2">
            {related.map(r => (
              <button key={r.prompt}
                onClick={() => { setQuery(r.prompt); ask(); }}
                className="px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20">
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
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
