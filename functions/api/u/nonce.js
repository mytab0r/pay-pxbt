/**
 * POST /api/u/nonce { chain } -> { nonce, message }
 * Одноразовый nonce (10 минут) для подписи владельцем при claim публичной страницы.
 * Формат сообщения тот же, что в /api/claim/nonce — verifyWalletSignature работает без изменений.
 */
export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => ({}));
  const chain = body && body.chain;
  if (!['evm', 'tron', 'solana', 'btc', 'ton'].includes(chain)) {
    return json({ ok: false, error: 'bad chain' }, 400);
  }
  const nonce = crypto.randomUUID().replace(/-/g, '');
  await env.KV.put('claim:' + nonce, JSON.stringify({ chain }), { expirationTtl: 600 });
  return json({ nonce, message: `pay.pxbt.app: claim ${nonce}\nвладелец pxbt.app` });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
