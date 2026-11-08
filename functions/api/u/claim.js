/**
 * POST /api/u/claim { chain, address, signature, nonce }
 * Проверяет подпись владения адресом и добавляет адрес в запись пользователя.
 * nonce сжигается только после успешной проверки (чужие nonce не сгорают).
 * Запись ищется по алиасу адреса, затем по cookie-сессии (второй и следующие адреса
 * того же пользователя), иначе создаётся новая. Ответ ставит cookie pay_owner.
 */
import { verifyWalletSignature, normalizeAddress } from '../../lib/wallet-verify.js';
import { loadUser, saveUser, signSession, verifySession, readOwnerCookie, primaryAddress, userKey } from '../../lib/users.js';

const CHAINS = ['evm', 'tron', 'solana', 'btc', 'ton'];

export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => ({}));
  const { chain, address, signature, nonce } = body || {};
  if (!CHAINS.includes(chain) || !address || !signature || !nonce) {
    return json({ ok: false, error: 'missing fields' }, 400);
  }
  if (!env.SESSION_SECRET) return json({ ok: false, error: 'session secret is not configured' }, 500);

  const nonceKey = 'claim:' + nonce;
  const raw = await env.KV.get(nonceKey);
  if (!raw) return json({ ok: false, error: 'nonce expired or unknown' }, 400);
  let storedNonce;
  try { storedNonce = JSON.parse(raw); } catch { storedNonce = null; }
  if (!storedNonce || storedNonce.chain !== chain) return json({ ok: false, error: 'chain mismatch' }, 400);

  const message = `pay.pxbt.app: claim ${nonce}\nвладелец pxbt.app`;
  let stored;
  try {
    const res = verifyWalletSignature({ chain, message, signature, address });
    stored = normalizeAddress(chain, res.address);
  } catch (e) {
    return json({ ok: false, error: 'signature verification failed', detail: String(e.message || e) }, 400);
  }
  await env.KV.delete(nonceKey);

  // Чужой/просроченный адрес не перезаписываем: сначала алиас адреса, затем своя сессия.
  let rec = await loadUser(env, stored);
  if (!rec) {
    const sessionId = await verifySession(readOwnerCookie(request), env.SESSION_SECRET);
    if (sessionId) rec = await loadUser(env, sessionId);
  }
  if (!rec) rec = { id: '', primary: '', addresses: {}, enabled: {} };
  const prevPrimary = rec.primary;
  rec.addresses = rec.addresses || {};
  rec.addresses[chain] = stored;
  rec.primary = primaryAddress(rec.addresses) || stored;
  rec.id = rec.primary;
  await saveUser(env, rec);
  // Смена адреса той же цепочки: старый primary больше не в записи — не оставляем его полную копию.
  if (prevPrimary && prevPrimary !== rec.primary && !Object.values(rec.addresses).includes(prevPrimary)) {
    await env.KV.delete(userKey(prevPrimary));
  }

  const cookie = await signSession(rec.primary, env.SESSION_SECRET);
  const proto = new URL(request.url).protocol;
  const forwarded = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  const secure = proto === 'https:' || forwarded === 'https' ? '; Secure' : '';
  return new Response(JSON.stringify({ ok: true, id: rec.primary, url: '/u/' + rec.primary }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': `pay_owner=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
