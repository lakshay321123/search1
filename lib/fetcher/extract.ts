import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export async function extractReadable(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'WizkidBot/0.1 (+https://example.com)' },
    });
    if (!r.ok) return '';
    const html = await r.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return (article?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
  } catch {
    return '';
  }
}
