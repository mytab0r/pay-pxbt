/**
 * POST /api/u/settings { enabled?: {...}, btcAddress?: "bc1q…" }
 * Только владелец по cookie pay_owner. Ключи enabled — лишь из известных сетей/токенов пользователя.
 * BTC принимается вручную: SafePal и большинство кошельков не отдают Bitcoin по WalletConnect
 * (в их namespace'ах нет bip122), а подпись BTC-адреса требует отдельного BTC-провайдера.
 */
import { saveUser, userFromRequest, userNetworks, userKey } from '../../lib/users.js';
import { validAddress } from '../../lib/config.js';

export async function onRequestPost({ env, request }) {
  const rec = await userFromRequest(env, request);
  if (!rec) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: 'object required' }, 400);
  }
  const hasEnabled = body.enabled !== undefined;
  const hasBtc = body.btcAddress !== undefined;
  if (!hasEnabled && !hasBtc) return json({ ok: false, error: 'enabled or btcAddress required' }, 400);

  let enabled = rec.enabled || {};
  if (hasEnabled) {
    const src = body.enabled;
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
    enabled = {};
    for (const [key, value] of entries) {
      if (!allowed.has(key)) return json({ ok: false, error: 'unknown key: ' + key }, 400);
      if (typeof value !== 'boolean') return json({ ok: false, error: 'value must be boolean: ' + key }, 400);
      enabled[key] = value;
    }
  }

  const prevBtc = rec.addresses && rec.addresses.btc;
  let btc = prevBtc;
  if (hasBtc) {
    const v = String(body.btcAddress || '').trim();
    if (v && !validAddress('btc', v)) {
      return json({ ok: false, error: 'BTC-адрес должен быть в формате bc1q… (P2WPKH)' }, 400);
    }
    btc = v || undefined;
    if (v) rec.addresses.btc = v;
    else delete rec.addresses.btc;
  }

  rec.enabled = enabled;
  await saveUser(env, rec);
  // адрес заменили/убрали — старый алиас больше не должен открывать эту запись
  if (hasBtc && prevBtc && prevBtc !== btc) await env.KV.delete(userKey(prevBtc));
  return json({ ok: true, enabled, btc: btc || null });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
