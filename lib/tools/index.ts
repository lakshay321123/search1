import type { SearchResult } from '../types';
import { searchGoogleCSE } from './googleCSE';
import { searchWikipedia } from './wikipedia';
import { searchBrave } from './brave';
import { searchSerper } from './serper';
import { searchTavily } from './tavily';
import { searchInstagram } from './instagram';
import { searchFacebook } from './facebook';

export type Provider = (q: string) => Promise<SearchResult[]>;

const enabled = {
  google: !!(process.env.GOOGLE_CSE_ID && process.env.GOOGLE_CSE_KEY),
  wikipedia: true,
  brave: !!process.env.BRAVE_API_KEY,
  serper: !!process.env.SERPER_API_KEY,
  tavily: !!process.env.TAVILY_API_KEY,
  instagram: !!(process.env.FB_APP_TOKEN && process.env.FB_IG_BUSINESS_ID),
  facebook: !!process.env.FB_APP_TOKEN,
};

export async function metaSearch(query: string, focus: 'all' | 'web' | 'wikipedia' | 'social'): Promise<SearchResult[]> {
  const tasks: Promise<SearchResult[]>[] = [];
  const add = (cond: boolean, fn: Provider) => cond && tasks.push(fn(query));

  if (focus === 'wikipedia') {
    add(true, searchWikipedia);
  } else if (focus === 'social') {
    add(enabled.instagram, searchInstagram);
    add(enabled.facebook, searchFacebook);
  } else {
    // web / all
    add(enabled.google, searchGoogleCSE);
    add(true, searchWikipedia);
    add(enabled.brave, searchBrave);
    add(enabled.serper, searchSerper);
    add(enabled.tavily, searchTavily);
    if (focus === 'all') {
      add(enabled.instagram, searchInstagram);
      add(enabled.facebook, searchFacebook);
    }
  }

  const batches = await Promise.allSettled(tasks);
  const flat = batches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []));
  return dedupe(flat).slice(0, 12);
}

function dedupe(arr: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of arr) {
    try {
      const u = new URL(r.url);
      u.hash = '';
      u.search = '';
      const key = u.toString();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    } catch {
      out.push(r);
    }
  }
  return out;
}
