/**
 * POST /api/u/settings { enabled?: {...}, btcAddress?: "bc1q…", tronAddress?: "T…" }
 * Только владелец по cookie pay_owner. Ключи enabled — лишь из известных сетей/токенов пользователя.
 * BTC и Tron принимаются вручную: WalletConnect их не отдаёт (у SafePal нет namespace bip122,
 * Tron вообще не входит в CAIP-сети кошельков), а подпись требует отдельного провайдера цепочки.
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
  const hasManual = body.btcAddress !== undefined || body.tronAddress !== undefined;
  if (!hasEnabled && !hasManual) return json({ ok: false, error: 'enabled, btcAddress or tronAddress required' }, 400);

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

  // Цепочки, которые кошельки не отдают по WalletConnect (BTC — нет namespace bip122, Tron —
  // нет в CAIP у SafePal): адрес вписывается вручную, проверяется только форма.
  const MANUAL = { btc: 'btcAddress', tron: 'tronAddress' };
  const changed = {};
  for (const [chain, field] of Object.entries(MANUAL)) {
    if (body[field] === undefined) continue;
    const v = String(body[field] || '').trim();
    if (v && !validAddress(chain, v)) {
      const hint = chain === 'btc' ? 'bc1q… (P2WPKH)' : 'T… (TRC20)';
      return json({ ok: false, error: `${chain.toUpperCase()}-адрес должен быть в формате ${hint}` }, 400);
    }
    changed[chain] = rec.addresses[chain];
    if (v) rec.addresses[chain] = v;
    else delete rec.addresses[chain];
  }

  rec.enabled = enabled;
  await saveUser(env, rec);
  // адрес заменили/убрали — старый алиас больше не должен открывать эту запись
  for (const [chain, prev] of Object.entries(changed)) {
    if (prev && prev !== rec.addresses[chain]) await env.KV.delete(userKey(prev));
  }
  return json({ ok: true, enabled, btc: rec.addresses.btc || null, tron: rec.addresses.tron || null });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
