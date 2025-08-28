'use client';
import { useEffect, useRef, useState } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };
type Candidate = { title: string; description?: string; image?: string; url: string };
type Place = { id: string; name: string; address?: string; lat: number; lon: number; distance_m?: number; phone?: string; website?: string; source?: string };
type Related = { label: string; prompt: string };

function host(u: string) { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } }

export default function Home() {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<'auto'|'openai'|'gemini'>('auto');
  const [usingLocation, setUsingLocation] = useState(false);
  const [coords, setCoords] = useState<{lat:number, lon:number}>();
  const [status, setStatus] = useState<string>();
  const [answer, setAnswer] = useState('');
  const [profile, setProfile] = useState<Profile>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [cites, setCites] = useState<Cite[]>([]);
  const [related, setRelated] = useState<Related[]>([]);
  const [confidence, setConfidence] = useState<string>();
  const abortRef = useRef<AbortController|null>(null);

  useEffect(() => {
    if (usingLocation && !coords && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
        e => setStatus(`Location error: ${e.message}`),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, [usingLocation, coords]);

  async function ask(e?: React.FormEvent, override?: string) {
    if (e) e.preventDefault();
    const q = (override ?? query).trim();
    if (!q) return;

    setStatus(''); setAnswer(''); setProfile(undefined); setCandidates([]);
    setPlaces([]); setCites([]); setRelated([]); setConfidence(undefined);
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;

    const body: any = { query: q, provider };
    if (usingLocation && !coords && navigator.geolocation) {
      setStatus('Getting your location…');
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 })
        );
        body.coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      } catch {}
    } else if (usingLocation && coords) {
      body.coords = coords;
    }

    const resp = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
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
          if (evt.event === 'profile') setProfile(evt.profile);
          if (evt.event === 'candidates') setCandidates(evt.candidates || []);
          if (evt.event === 'places') setPlaces(evt.places || []);
          if (evt.event === 'cite') setCites(c => c.some(x => x.url === evt.cite.url) ? c : [...c, evt.cite]);
          if (evt.event === 'related') setRelated(evt.items || []);
          if (evt.event === 'final') setConfidence(evt.snapshot?.confidence);
          if (evt.event === 'error') setStatus(`error: ${evt.msg}`);
        } catch {}
      }
    }
  }

  async function feedback(helpful: boolean) {
    try { await fetch('/api/feedback', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ query, helpful }) }); } catch {}
  }

  return (
    <main style={{maxWidth: 960, margin: '0 auto', padding: 16}}>
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12}}>
        <button onClick={()=>window.location.reload()} style={titleStyle}>Wizkid</button>
        <div style={{display:'flex', gap: 8}}>
          <select value={provider} onChange={e=>setProvider(e.target.value as any)} style={btnStyle}>
            <option value="auto">Auto</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          <button onClick={()=>setUsingLocation(x=>!x)} style={{...btnStyle, background: usingLocation ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}}>{usingLocation ? 'Location ✓' : 'Use my location'}</button>
        </div>
      </header>

      <form onSubmit={ask} style={{display:'flex', gap:8, marginBottom: 12}}>
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Ask anything (e.g., 'amit shah', 'property lawyer near me', 'pinch of yum oatmeal')"
          style={inputStyle}
        />
        <button type="submit" style={btnStyle}>Search</button>
      </form>

      {candidates.length > 0 && (
        <div style={{marginBottom: 8}}>
          <div style={{opacity:0.8, fontSize:12, marginBottom:4}}>Did you mean:</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
            {candidates.map(c => (
              <button key={c.title} onClick={()=>{ setQuery(c.title); ask(undefined, c.title); }} style={chipStyle}>{c.title}</button>
            ))}
          </div>
        </div>
      )}

      {(profile?.image || profile?.title) && (
        <section style={{display:'flex', alignItems:'center', gap:12, marginBottom: 8}}>
          {profile?.image && <img src={profile.image} alt={profile?.title || 'profile'} style={{width:64, height:64, borderRadius:12, objectFit:'cover'}} />}
          <div>
            <div style={{fontSize:20, fontWeight:600}}>{profile?.title}</div>
            {profile?.description && <div style={{opacity:0.8, fontSize:14}}>{profile.description}</div>}
            {profile?.wikiUrl && <a href={profile.wikiUrl} target="_blank" style={{fontSize:12, textDecoration:'underline', opacity:0.8}}>Wikipedia</a>}
          </div>
        </section>
      )}

      {/* Streaming answer */}
      <article style={cardStyle}>
        {status && <div style={{opacity:0.7, fontSize:12, marginBottom:8}}>{status}</div>}
          <div dangerouslySetInnerHTML={{ __html: (answer || '').replace(/\n/g,'<br/>') }} />
        {confidence && (
          <div style={{marginTop:10, fontSize:14}}>
            Confidence: <b>{confidence}</b>
            <span style={{marginLeft:12}}>
              <button onClick={()=>feedback(true)} style={miniBtn}>👍</button>
              <button onClick={()=>feedback(false)} style={miniBtn}>👎</button>
            </span>
          </div>
        )}
      </article>

      {/* Related chips */}
      {related.length > 0 && (
        <div style={{marginTop:8}}>
          <div style={{opacity:0.8, fontSize:12, marginBottom:4}}>Related</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
            {related.map(r => (
              <button key={r.prompt} onClick={()=>{ setQuery(r.prompt); ask(undefined, r.prompt); }} style={chipStyle}>{r.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Local pack */}
      {places.length > 0 && (
        <section style={{marginTop: 12, display:'grid', gap:10}}>
          {places.map(p => (
            <div key={p.id} style={cardStyle}>
              <div style={{fontWeight:600}}>{p.name}</div>
              <div style={{opacity:0.85, fontSize:14}}>{p.address}</div>
              <div style={{opacity:0.85, fontSize:14}}>
                {p.distance_m!=null ? `${Math.round(p.distance_m/100)/10} km` : ''}{p.phone ? ` • ${p.phone}` : ''}{p.website ? ' • ' : ''}
                {p.website && <a href={p.website} target="_blank" style={{textDecoration:'underline'}}>Website</a>}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Sources */}
      {!!cites.length && (
        <aside style={{marginTop: 16, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12}}>
          {cites.map(c => (
            <a key={c.id} href={c.url} target="_blank" rel="noreferrer" style={cardStyle as any}>
              <div style={{fontSize:12, opacity:0.7}}>Source {c.id} • {host(c.url)}</div>
              <div style={{fontWeight:600, marginTop:4}}>{c.title}</div>
              {c.snippet && <div style={{opacity:0.85, fontSize:14, marginTop:4}}>{c.snippet}</div>}
            </a>
          ))}
        </aside>
      )}
    </main>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 24, fontWeight: 800, background:'none', color:'white', border:'none', cursor:'pointer' };
const inputStyle: React.CSSProperties = { flex:1, borderRadius:12, padding:'12px 14px', background:'rgba(255,255,255,0.08)', color:'white', border:'1px solid rgba(255,255,255,0.1)', outline:'none' };
const btnStyle: React.CSSProperties = { borderRadius:12, padding:'10px 14px', background:'rgba(255,255,255,0.12)', color:'white', border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer' };
const chipStyle: React.CSSProperties = { borderRadius:999, padding:'6px 10px', background:'rgba(255,255,255,0.1)', color:'white', border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', fontSize:13 };
const cardStyle: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:16, padding:16, minHeight:100 };
const miniBtn: React.CSSProperties = { borderRadius:8, padding:'4px 8px', marginLeft:6, background:'rgba(255,255,255,0.12)', color:'white', border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer' };
