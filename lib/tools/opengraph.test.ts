import { fetchOpenGraph } from './opengraph';

test('extracts title and image', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve("<meta property='og:title' content='Hi'><meta property='og:image' content='img.png'>"),
    }) as any
  );
  const res = await fetchOpenGraph('https://example.com');
  expect(res).toEqual({ title: 'Hi', image: 'img.png' });
});

test('returns null on fetch failure', async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false }) as any);
  await expect(fetchOpenGraph('https://bad.com')).resolves.toBeNull();
});

test('handles missing tags', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') }) as any
  );
  const res = await fetchOpenGraph('https://empty.com');
  expect(res).toEqual({ title: undefined, image: undefined });
});

test('handles malformed html', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve("<meta property='og:title' content='Hi'><meta property='og:image' content='img.png'"),
    }) as any
  );
  const res = await fetchOpenGraph('https://broken.com');
  expect(res).toEqual({ title: 'Hi', image: undefined });
});
