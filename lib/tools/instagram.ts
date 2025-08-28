import type { SearchResult } from '../types';

export async function searchInstagram(q: string): Promise<SearchResult[]> {
  const token = process.env.FB_APP_TOKEN;
  const biz = process.env.FB_IG_BUSINESS_ID;
  if (!token || !biz) return [];
  try {
    const h = await fetch(`https://graph.facebook.com/v18.0/ig_hashtag_search?user_id=${biz}&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!h.ok) return [];
    const hid = (await h.json())?.data?.[0]?.id;
    if (!hid) return [];
    const r = await fetch(
      `https://graph.facebook.com/v18.0/${hid}/recent_media?user_id=${biz}&fields=permalink,caption,media_type,media_url&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return [];
    const j = await r.json();
    const arr = (j.data || []) as any[];
    return arr.map((m) => ({
      title: (m.caption || '').slice(0, 80) || 'Instagram post',
      url: m.permalink,
      snippet: m.caption?.slice(0, 160),
      source: 'instagram',
    }));
  } catch {
    return [];
  }
}
