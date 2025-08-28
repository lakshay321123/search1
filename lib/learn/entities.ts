import { redis, hasRedis } from '../store/kv';
import { normalizeName } from '../text/similarity';

const NS = 'wizkid:ent';

function qKey(q: string) { return `${NS}:${normalizeName(q)}`; }

export async function preferEntity(query: string, name: string, weight = 1) {
  if (!hasRedis()) return;
  await redis!.zincrby(`${qKey(query)}:prefer`, weight, name);
}

export async function avoidEntity(query: string, name: string, weight = 1) {
  if (!hasRedis()) return;
  await redis!.zincrby(`${qKey(query)}:avoid`, weight, name);
}

export type EntityBias = { prefer: Map<string, number>; avoid: Map<string, number> };

export async function loadEntityBias(query: string): Promise<EntityBias> {
  const out: EntityBias = { prefer: new Map(), avoid: new Map() };
  if (!hasRedis()) return out;
  const pref = await redis!.zrange<(string|number)[]>(`${qKey(query)}:prefer`, 0, -1, { withScores: true });
  const av   = await redis!.zrange<(string|number)[]>(`${qKey(query)}:avoid`,   0, -1, { withScores: true });
  for (let i=0;i<pref.length;i+=2) out.prefer.set(String(pref[i]), Number(pref[i+1]));
  for (let i=0;i<av.length;i+=2)   out.avoid.set(String(av[i]), Number(av[i+1]));
  return out;
}
