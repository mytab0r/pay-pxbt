/**
 * POST /api/u/settings { enabled: { <netId|netId:tokenId>: boolean } }
 * Только владелец по cookie pay_owner. Ключи — лишь из известных сетей/токенов пользователя.
 */
import { saveUser, userFromRequest, userNetworks } from '../../lib/users.js';

export async function onRequestPost({ env, request }) {
  const rec = await userFromRequest(env, request);
  if (!rec) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  const src = body && body.enabled;
  if (!src || typeof src !== 'object' || Array.isArray(src)) {
    return json({ ok: false, error: 'enabled object required' }, 400);
  }
  const entries = Object.entries(src);
  if (entries.length > 100) return json({ ok: false, error: 'too many keys' }, 400);

  const allowed = new Set();
  for (const n of userNetworks(rec)) {
    allowed.add(n.id);
    for (const t of n.tokens || []) allowed.add(n.id + ':' + t.id);
  }
  const enabled = {};
  for (const [key, value] of entries) {
    if (!allowed.has(key)) return json({ ok: false, error: 'unknown key: ' + key }, 400);
    if (typeof value !== 'boolean') return json({ ok: false, error: 'value must be boolean: ' + key }, 400);
    enabled[key] = value;
  }
  rec.enabled = enabled;
  await saveUser(env, rec);
  return json({ ok: true, enabled });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
