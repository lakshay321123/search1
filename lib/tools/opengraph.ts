// Simple OG tag reader for images/titles.
// Free and fast; no headless browser required.
export async function fetchOpenGraph(url: string): Promise<{ title?: string; image?: string } | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const html = await r.text();

    const get = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
      return m?.[1];
    };

    const title = get('og:title') || get('twitter:title');
    const image = get('og:image') || get('twitter:image');
    return { title: title || undefined, image: image || undefined };
  } catch { return null; }
}
