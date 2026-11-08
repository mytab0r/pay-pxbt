/**
 * Сети и токены — единственный источник для лендинга, /pay и /u/<id>.
 * Порядок по объёму USDT (DefiLlama 25.10.2026): Tron, Ethereum, BSC, Polygon, Arbitrum, Base, Solana, BTC, TON.
 * LTC/XRP/DOGE не добавляем (риск отправки не в ту сеть).
 */
export const EVM_TOKENS = [
  { id: 'usdt', label: 'USDT', contracts: { eth: '0xdAC17F958D2ee523a2206206994597C13D831ec7', bsc: '0x55d398326f99059fF775485246999027B3197955', poly: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', arb: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', base: null } },
  { id: 'usdc', label: 'USDC', contracts: { eth: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', bsc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', poly: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', arb: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } },
];

export const NETWORKS = [
  { id: 'tron', label: 'USDT · Tron (TRC20)', net: 'Tron (TRC20)', warn: null },
  { id: 'evm:eth', label: 'Ethereum (ERC20)', net: 'Ethereum (ERC20)', warn: 'высокая комиссия сети', evm: true },
  { id: 'evm:bsc', label: 'BNB Smart Chain (BEP20)', net: 'BSC (BEP20)', warn: null, evm: true },
  { id: 'evm:poly', label: 'Polygon (PoS)', net: 'Polygon (PoS)', warn: null, evm: true },
  { id: 'evm:arb', label: 'Arbitrum One', net: 'Arbitrum One', warn: null, evm: true },
  { id: 'evm:base', label: 'Base', net: 'Base', warn: null, evm: true },
  { id: 'solana', label: 'USDT · Solana', net: 'Solana', warn: null },
  { id: 'btc', label: 'Bitcoin (BTC)', net: 'Bitcoin', warn: 'подтверждения 10–30 мин' },
  { id: 'ton', label: 'TON', net: 'TON', warn: null },
];

/** Сети для адреса этой цепочки: EVM-адрес один на все EVM-сети, остальные работают только в своей. */
export function networksFor(chain) {
  const out = [];
  for (const n of NETWORKS) {
    if (chain === 'evm') {
      if (!n.evm) continue;
      const sub = n.id.split(':')[1];
      const tokens = EVM_TOKENS.map((t) => ({ id: t.id, label: t.label, contract: t.contracts[sub] })).filter((t) => t.contract);
      if (tokens.length) out.push({ id: n.id, label: n.label, net: n.net, warn: n.warn, tokens });
    } else if (n.id === chain) out.push({ id: n.id, label: n.label, net: n.net, warn: n.warn });
  }
  return out;
}
