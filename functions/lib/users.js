/**
 * Пользователи публичных страниц /u/<id>: запись в KV + подписанная cookie-сессия.
 * Ключ записи — user:<primary>; каждый остальной адрес — алиас user:<addr> -> {alias:true, primary}.
 * Запись: {id, primary, addresses:{evm|tron|solana|btc|ton}, enabled:{...}, createdAt, updatedAt}.
 * enabled хранит только явные решения; отсутствующий ключ = включено.
 * Сети/токены не дублируются: берутся из functions/pay/index.js (NETWORKS, EVM_TOKENS).
 */
import { NETWORKS, EVM_TOKENS } from '../pay/index.js';

const enc = new TextEncoder();
const CHAIN_ORDER = ['evm', 'tron', 'solana', 'btc', 'ton'];

export function userKey(id) {
  return 'user:' + id;
}

/** Запись пользователя или null; алиас резолвится в запись по primary. */
export async function loadUser(env, id) {
  if (!env || !env.KV || !id) return null;
  const raw = await env.KV.get(userKey(id));
  if (!raw) return null;
  let rec;
  try { rec = JSON.parse(raw); } catch { return null; }
  if (rec && rec.alias) {
    if (!rec.primary) return null;
    const full = await env.KV.get(userKey(rec.primary));
    if (!full) return null;
    try { rec = JSON.parse(full); } catch { return null; }
  }
  return rec && rec.primary ? rec : null;
}

/** Полная запись по ключу primary + алиасы по всем остальным адресам. */
export async function saveUser(env, rec) {
  const now = Math.floor(Date.now() / 1000);
  rec.id = rec.primary;
  rec.updatedAt = now;
  if (!rec.createdAt) rec.createdAt = now;
  await env.KV.put(userKey(rec.primary), JSON.stringify(rec));
  for (const addr of Object.values(rec.addresses || {})) {
    if (!addr || addr === rec.primary) continue;
    await env.KV.put(userKey(addr), JSON.stringify({ alias: true, primary: rec.primary }));
  }
}

/** Доступные сети пользователя (по его адресам), с токенами для EVM. Без фильтра enabled. */
export function userNetworks(rec) {
  const out = [];
  const addresses = (rec && rec.addresses) || {};
  for (const n of NETWORKS) {
    const [kind, sub] = n.id.split(':');
    const address = addresses[kind];
    if (!address) continue;
    if (kind === 'evm') {
      const tokens = EVM_TOKENS
        .map((t) => ({ id: t.id, label: t.label, contract: t.contracts[sub] }))
        .filter((t) => t.contract);
      if (tokens.length) out.push({ id: n.id, label: n.label, net: n.net, warn: n.warn, address, tokens });
    } else {
      out.push({ id: n.id, label: n.label, net: n.net, warn: n.warn, address });
    }
  }
  return out;
}

/** Явно отключено? Отсутствующий ключ означает «включено». */
export function isEnabled(rec, key) {
  return !(rec && rec.enabled && rec.enabled[key] === false);
}

/** Primary = первый подтверждённый адрес в порядке цепочек. */
export function primaryAddress(addresses) {
  const chain = CHAIN_ORDER.find((c) => addresses && addresses[c]);
  return chain ? addresses[chain] : null;
}

async function hmacHex(id, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(id));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Значение cookie: <id>.<hmac-sha256 hex>. */
export async function signSession(id, secret) {
  if (!id || !secret) throw new Error('session secret is not configured');
  return id + '.' + (await hmacHex(id, secret));
}

/** id из cookie или null. Сравнение hex без раннего выхода. */
export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !secret || typeof cookieValue !== 'string') return null;
  const i = cookieValue.lastIndexOf('.');
  if (i <= 0) return null;
  const id = cookieValue.slice(0, i);
  const mac = cookieValue.slice(i + 1);
  const expected = await hmacHex(id, secret);
  if (mac.length !== expected.length) return null;
  let diff = 0;
  for (let k = 0; k < expected.length; k++) diff |= mac.charCodeAt(k) ^ expected.charCodeAt(k);
  return diff === 0 ? id : null;
}

/** Значение cookie pay_owner из запроса. */
export function readOwnerCookie(request) {
  const cookie = (request && request.headers && request.headers.get('cookie')) || '';
  const m = cookie.match(/(?:^|;\s*)pay_owner=([^;]+)/);
  return m ? m[1] : null;
}

/** Владелец по cookie: запись или null. Алиас (старый primary) тоже резолвится. */
export async function userFromRequest(env, request) {
  const id = await verifySession(readOwnerCookie(request), env && env.SESSION_SECRET);
  if (!id) return null;
  return loadUser(env, id);
}
