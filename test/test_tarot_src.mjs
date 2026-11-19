/**
 * Tarot attribution + public funnel counters (t_cda5a575).
 * src must survive from link -> landing -> reading into counters; stats.json is public.
 * Run: node test/test_tarot_src.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeServer } from '../deploy/pay-page/server.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-src-'));
const srv = makeServer({ dataDir: dir, apiToken: 'tok123' });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const req = (p, init = {}) => fetch(base + p, init);
const post = (p, body) => req(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const srcOf = (html) => (html.match(/const SRC=("[^"]*");/) || [])[1];

try {
  // valid source reaches the page verbatim (previously hardcoded "other")
  let html = await (await req('/tarot?src=probe')).text();
  assert.strictEqual(srcOf(html), '"probe"', 'src param rendered into the page');

  // normalised, whitelist [a-z0-9_-]{1,16}; anything else -> other
  assert.strictEqual(srcOf(await (await req('/tarot?src=PROBE')).text()), '"probe"', 'src lowercased');
  assert.strictEqual(srcOf(await (await req('/tarot?src=ig_reels-01')).text()), '"ig_reels-01"', 'dash + underscore allowed');
  assert.strictEqual(srcOf(await (await req('/tarot?src=%3Cscript%3E')).text()), '"other"', 'html junk rejected');
  assert.strictEqual(srcOf(await (await req('/tarot?src=..%2F..%2Fetc')).text()), '"other"', 'path junk rejected');
  assert.strictEqual(srcOf(await (await req('/tarot?src=' + 'a'.repeat(17))).text()), '"other"', 'over 16 chars rejected');
  assert.strictEqual(srcOf(await (await req('/tarot')).text()), '"web"', 'no src -> web');

  // reading keeps the source (lead attribution)
  assert.strictEqual((await post('/api/tarot/reading', { question: 'q', src: 'probe' })).status, 200);
  assert.strictEqual((await post('/api/tarot/reading', { question: 'q', src: '<script>' })).status, 200);

  // public counters, no token
  let r = await req('/api/tarot/stats.json');
  assert.strictEqual(r.status, 200, 'stats.json is public');
  const st = await r.json();
  assert.strictEqual(st.visits.probe, 2, 'probe visits counted');
  assert.strictEqual(st.visits['ig_reels-01'], 1, 'dash source counted');
  assert.strictEqual(st.visits.other, 3, 'junk land in other');
  assert.strictEqual(st.visits.web, 1, 'default source counted');
  assert.strictEqual(st.leads.probe, 1);
  assert.strictEqual(st.leads.other, 1);
  assert.strictEqual(st.checkouts, 0);
  assert.strictEqual(st.paid, 0);
  assert.deepStrictEqual(st.last7.visits.probe, 2, '7-day window covers today');
  assert.deepStrictEqual(st.last7.leads.probe, 1);
  assert.strictEqual(st.last7.checkouts, 0);

  // no PII / no secrets in the public payload
  const raw = JSON.stringify(st);
  assert.ok(!/127\.0\.0\.1|tok123/.test(raw), 'no internal data leaked');

  // token route stays closed
  assert.strictEqual((await req('/api/tarot/stats')).status, 403, 'legacy token route unchanged');
  console.log('test_tarot_src OK');
} finally {
  srv.close();
}
