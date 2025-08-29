'use client';
import { useState, useRef, useMemo } from 'react';

type Cite = { id: string; url: string; title: string; snippet?: string };
type Profile = { title?: string; description?: string; extract?: string; image?: string; wikiUrl?: string };
type Candidate = { title: string; description?: string; pageUrl?: string; image?: string };
type RelatedItem = { label: string; prompt: string };
type Place = { id: string; name: string; address?: string; lat: number; lon: number; distance_m?: number; phone?: string; website?: string; category?: string; source?: string; osmUrl?: string };

export default function Home() {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<string|undefined>();
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string|undefined>();
  const [cites, setCites] = useState<Cite[]>([]);
  const [profile, setProfile] = useState<Profile|undefined>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [confidence, setConfidence] = useState<string|undefined>();
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController|null>(null);
  const [voteSent, setVoteSent] = useState<null | 'up' | 'down'>(null);
  const [downReason, setDownReason] = useState<string | null>(null);

  function resetAll() {
    setQuery(''); setSubject(undefined); setProfile(undefined); setCandidates([]); setRelated([]);
    setCites([]); setAnswer(''); setPlaces([]); setConfidence(undefined); setStatus(undefined);
  }

  function looksLocal(q: string) {
    const s = q.toLowerCase();
    return /\bnear\s*me\b|\bnearby\b/.test(s) || /doc|dr|doctor|clinic|lawyer|attorney|advocate|dentist|pharmacy|restaurant|cafe|bank|atm/.test(s) && /near|me|nearby/.test(s);
  }

  async function getCoordsIfNeeded(q: string): Promise<{lat:number,lon:number}|undefined> {
    if (!looksLocal(q)) return undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 6000 })
      );
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      try {
        const r = await fetch('/api/geo', { cache: 'no-store' });
        const j = await r.json();
        return j?.coords || undefined;
      } catch {
        return undefined;
      }
    }
  }

  async function ask(e?: React.FormEvent, qOverride?: string) {
    if (e) e.preventDefault();
    if (busy) return;
    setBusy(true);
    const q = (qOverride ?? query).trim();
    if (!q) { setBusy(false); return; }

    setAnswer(''); setCites([]); setConfidence(undefined); setProfile(undefined);
    setCandidates([]); setRelated([]); setPlaces([]); setStatus('');
    setVoteSent(null); setDownReason(null);
    abortRef.current?.abort();

    const ac = new AbortController(); abortRef.current = ac;
    const coords = await getCoordsIfNeeded(q);
    const body:any = { query: q, coords };

    const resp = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
          if (evt.event === 'token') setAnswer(a => a + evt.text);
          if (evt.event === 'cite')
            setCites(c => c.some(x => x.url === evt.cite.url) ? c : [...c, evt.cite]);
          if (evt.event === 'profile') { setProfile(evt.profile); if (evt.profile?.title) setSubject(evt.profile.title); }
          if (evt.event === 'candidates') setCandidates(evt.candidates || []);
          if (evt.event === 'related') setRelated(evt.items || []);
          if (evt.event === 'places') setPlaces(evt.places || []);
          if (evt.event === 'error') setStatus(`error: ${evt.msg}`);
          if (evt.event === 'final') setConfidence(evt.snapshot.confidence);
        } catch {}
      }
    }
    setBusy(false);
  }

  async function sendFeedback(vote: 'up'|'down', reason?: string) {
    if (voteSent) return;
    try {
      await fetch('/api/feedback', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          query,
          subject: profile?.title,
          vote,
          reason,
          cites: cites.map(c => ({ url: c.url })),
        })
      });
      setVoteSent(vote);
    } catch {}
  }

  const onOpen = async (url: string) => {
    try { await fetch('/api/click', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) }); } catch {}
    window.open(url, '_blank', 'noreferrer');
  };

  const socialLinks = useMemo(() => {
    const wiki = cites.find(c => /wikipedia\.org/.test(c.url));
    const linkedin = cites.find(c => /linkedin\.com/.test(c.url));
    const insta = cites.find(c => /instagram\.com/.test(c.url));
    const fb = cites.find(c => /facebook\.com/.test(c.url));
    const x = cites.find(c => /x\.com|twitter\.com/.test(c.url));
    return { wiki, linkedin, insta, fb, x };
  }, [cites, profile]);

  return (
    <main className="max-w-3xl mx-auto p-4">
      {/* Header with LOGO = HOME */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={resetAll} className="text-3xl font-bold hover:opacity-80">Wizkid</button>
      </div>

      {/* Search bar */}
      <form onSubmit={ask} className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 bg-white/10 outline-none"
          placeholder="Ask anything… e.g., “doctor near me”, “Amit Shah”, “CLS Foods India Private Limited”"
        />
        <button className="px-5 py-3 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {/* Did you mean… */}
      {candidates.length > 0 && (
        <div className="mb-3">
          <div className="text-sm opacity-80 mb-1">Did you mean:</div>
          <div className="flex flex-wrap gap-2">
            {candidates.map(c => (
              <button key={c.title}
                onClick={() => { setQuery(c.title); setSubject(c.title); ask(undefined, c.title); }}
                className="px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20">
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero */}
      {(profile?.image || profile?.title) && (
        <section className="flex items-center gap-4 mb-2">
          {profile?.image && <img src={profile.image} alt={profile?.title || 'profile'} className="w-16 h-16 rounded-xl object-cover" />}
          <div>
            <div className="text-xl font-semibold">{profile?.title || subject || query}</div>
            {profile?.description && <div className="text-sm opacity-80">{profile.description}</div>}
            <div className="flex gap-2 mt-1 text-xs">
              {socialLinks.wiki && <a className="px-2 py-1 bg-white/10 rounded" href={socialLinks.wiki.url} target="_blank" rel="noreferrer">Wiki</a>}
              {socialLinks.linkedin && <a className="px-2 py-1 bg-white/10 rounded" href={socialLinks.linkedin.url} target="_blank" rel="noreferrer">LinkedIn</a>}
              {socialLinks.insta && <a className="px-2 py-1 bg-white/10 rounded" href={socialLinks.insta.url} target="_blank" rel="noreferrer">Instagram</a>}
              {socialLinks.fb && <a className="px-2 py-1 bg-white/10 rounded" href={socialLinks.fb.url} target="_blank" rel="noreferrer">Facebook</a>}
              {socialLinks.x && <a className="px-2 py-1 bg-white/10 rounded" href={socialLinks.x.url} target="_blank" rel="noreferrer">X</a>}
            </div>
          </div>
        </section>
      )}

      {/* Streaming answer */}
      <article className="prose prose-invert max-w-none bg-white/5 p-4 rounded-2xl min-h-[140px]">
        {status && <div className="text-xs opacity-70 mb-2">{status}</div>}
        <div dangerouslySetInnerHTML={{ __html: (answer || '').replaceAll('\n','<br/>') }} />
        {confidence && <div className="mt-3 text-sm">Confidence: <span className="font-semibold">{confidence}</span></div>}
      </article>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <button
          onClick={() => sendFeedback('up')}
          disabled={!!voteSent}
          className={`px-3 py-1 rounded ${voteSent==='up' ? 'bg-green-600/40' : 'bg-white/10 hover:bg-white/20'}`}
        >👍 Helpful</button>

        <button
          onClick={() => { setDownReason(null); sendFeedback('down'); }}
          disabled={!!voteSent}
          className={`px-3 py-1 rounded ${voteSent==='down' ? 'bg-red-600/40' : 'bg-white/10 hover:bg-white/20'}`}
        >👎 Not helpful</button>
      </div>
      {voteSent==='down' && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {[
            ['wrong_person','Wrong person'],
            ['outdated','Outdated info'],
            ['low_quality','Low-quality sources'],
            ['not_local','Not local'],
            ['other','Other…'],
          ].map(([key,label]) => (
            <button key={key}
              onClick={() => { setDownReason(key); sendFeedback('down', key); }}
              className={`px-2 py-1 rounded ${downReason===key ? 'bg-red-600/40' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Places list for local */}
      {!!places.length && (
        <section className="mt-4">
          <div className="text-sm opacity-80 mb-1">Nearby</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {places.map(p => (
              <a key={p.id} href={p.osmUrl} target="_blank" rel="noreferrer" className="block bg-white/5 p-4 rounded-xl hover:bg-white/10 transition">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs opacity-80">{p.category}{p.address ? ` • ${p.address}` : ''}</div>
                <div className="text-xs opacity-70 mt-1">
                  {p.distance_m != null ? `${Math.round(p.distance_m/100)/10} km` : ''} {p.phone ? `• ${p.phone}` : ''} {p.website ? `• ${new URL(p.website).hostname}` : ''}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Sources */}
      {!!cites.length && (
        <aside className="mt-6 grid gap-3 sm:grid-cols-2">
          {cites.map(c => (
            <a key={c.id} href={c.url} onClick={(e)=>{ e.preventDefault(); onOpen(c.url); }} className="block bg-white/5 p-4 rounded-xl hover:bg-white/10 transition">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm opacity-70">Source {c.id}</div>
                <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/10">
                  {(() => { try { return new URL(c.url).hostname.replace(/^www\./,''); } catch { return ''; } })()}
                </div>
              </div>
              <div className="font-semibold line-clamp-2">{c.title}</div>
              {c.snippet && <div className="text-sm opacity-80 mt-1 line-clamp-3">{c.snippet}</div>}
            </a>
          ))}
        </aside>
      )}
    </main>
  );
}

