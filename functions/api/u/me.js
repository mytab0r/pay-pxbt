/**
 * GET /api/u/me -> { ok, record } по cookie pay_owner, иначе 401.
 */
import { userFromRequest } from '../../lib/users.js';

export async function onRequestGet({ env, request }) {
  const rec = await userFromRequest(env, request);
  if (!rec) return json({ ok: false, error: 'unauthorized' }, 401);
  return json({ ok: true, record: rec });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
