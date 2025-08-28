import { redis, hasRedis } from '../store/kv';

const NS = 'wizkid:dom'; // namespace

function hostOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; }
}

export async function recordShow(url: string) {
  if (!hasRedis()) return;
  const h = hostOf(url); if (!h) return;
  await redis!.hincrby(`${NS}:ctr:${h}`, 'shows', 1);
}

export async function recordClick(url: string) {
  if (!hasRedis()) return;
  const h = hostOf(url); if (!h) return;
  await redis!.hincrby(`${NS}:ctr:${h}`, 'clicks', 1);
}

export async function domainScore(url: string): Promise<number> {
  if (!hasRedis()) return 0;
  const h = hostOf(url); if (!h) return 0;
  const row = await redis!.hgetall<Record<string, number>>(`${NS}:ctr:${h}`);
  const shows = Number(row?.shows || 0);
  const clicks = Number(row?.clicks || 0);
  const ctr = clicks / Math.max(1, shows);
  // Wilson-ish smoothing + small click bonus; cap to keep sane
  return Math.min(5, (ctr * 2) + Math.min(1, clicks / 10));
}
