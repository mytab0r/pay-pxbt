/**
 * GET /pay — публичные реквизиты владельца (глобальный конфиг KV).
 * Если у владельца уже есть запись пользователя (/api/u/claim), отдаём его личную страницу:
 * там все его адреса и только те сети/монеты, что он оставил включёнными.
 * Иначе — тот же выбор «сеть (и монета) -> реквизиты» из глобального конфига.
 */
import { CONFIG_KEY, defaultConfig } from '../lib/config.js';
import { NETWORKS, EVM_TOKENS } from '../lib/networks.js';
import { loadUser } from '../lib/users.js';
import { renderPaymentPage, onRequestGet as userPage } from '../u/[[id]].js';

export { NETWORKS, EVM_TOKENS };

/** Сети из глобального конфига: только те, у которых задан адрес. */
export function netsFromConfig(cfg) {
  const a = (cfg && cfg.addresses) || {};
  return NETWORKS
    .map((n) => {
      const [kind, sub] = n.id.split(':');
      if (kind === 'evm') {
        const tokens = EVM_TOKENS.map((t) => ({ id: t.id, label: t.label, contract: t.contracts[sub] })).filter((t) => t.contract);
        return { ...n, address: a.evm, tokens };
      }
      return { ...n, address: a[kind] };
    })
    .filter((n) => n.address && (!n.tokens || n.tokens.length));
}

export async function onRequestGet({ env = {}, request, params = {} }) {
  const cfg = JSON.parse((await env.KV.get(CONFIG_KEY)) || JSON.stringify(defaultConfig()));
  const owner = (cfg.addresses || {}).evm;
  if (owner) {
    const rec = await loadUser(env, owner);
    if (rec) return userPage({ params: { ...params, id: rec.primary }, request, env });
  }
  return renderPaymentPage({ nets: netsFromConfig(cfg), short: 'pay.pxbt.app', subtitle: 'Реквизиты pay.pxbt.app' });
}
