import * as cheerio from 'cheerio';

export async function fetchOpenGraph(url: string): Promise<{ title?: string; image?: string } | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const html = await r.text();
    const $ = cheerio.load(html);
    const get = (props: string[]): string | undefined => {
      for (const p of props) {
        const val = $(`meta[property='${p}'],meta[name='${p}']`).attr('content');
        if (val) return val;
      }
      return undefined;
    };
    return {
      title: get(['og:title', 'twitter:title']),
      image: get(['og:image', 'twitter:image']),
    };
  } catch {
    return null;
  }
}
