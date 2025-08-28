export const rid = () => (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

export const norm = (u: string) => {
  try {
    const x = new URL(u);
    x.hash = '';
    x.search = '';
    return x.toString();
  } catch {
    return u;
  }
};

export async function streamPlain(send: (o: any) => void, text: string) {
  for (const ch of (text.match(/.{1,90}(\s|$)/g) || [text])) send({ event: 'token', text: ch });
}
