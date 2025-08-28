export async function fetchOpenGraph(url: string): Promise<{ title?: string; image?: string } | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const html = await r.text();
    const pick = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ||
      html.match(new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1];
    return { title: pick('og:title') || pick('twitter:title') || undefined, image: pick('og:image') || pick('twitter:image') || undefined };
  } catch { return null; }
}

