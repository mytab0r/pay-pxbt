/**
 * Tarot: ограничение кардинальности src в счётчике воронки (t_13ad9ec6).
 * Публичный POST /api/tarot/reading принимает произвольный src: без лимита любой скрипт
 * набивает тысячи ключей в tarot:stats, а каждый bump перезаписывает значение целиком.
 * Run: node test/test_tarot_src_cap.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeServer } from '../deploy/pay-page/server.mjs';

const LIMIT = 50;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-cap-'));
const srv = makeServer({ dataDir: dir, apiToken: 'tok123' });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const req = (p, init = {}) => fetch(base + p, init);
const post = (p, body) => req(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const kvValue = (k) => JSON.parse(JSON.parse(fs.readFileSync(path.join(dir, 'kv.json'), 'utf8'))[k].v);
const today = () => 'tarot:stats:' + new Date().toISOString().slice(0, 10);
const srcKeys = (m) => Object.keys(m).filter((k) => k !== 'other');

try {
  for (let i = 0; i < 200; i++) {
    const r = await post('/api/tarot/reading', { question: 'q', src: 's' + i });
    assert.strictEqual(r.status, 200);
  }

  // хранилище: не больше LIMIT ключей на поле + other, остальное ушло в other
  const st = kvValue('tarot:stats');
  assert.ok(srcKeys(st.leads).length <= LIMIT, `leads: <=${LIMIT} src keys, got ${srcKeys(st.leads).length}`);
  assert.ok(srcKeys(st.visits).length <= LIMIT, `visits: <=${LIMIT} src keys, got ${srcKeys(st.visits).length}`);
  assert.strictEqual(st.leads.other, 200 - LIMIT, 'dropped srcs counted in other');
  assert.strictEqual(st.leads.s0, 1, 'first src kept verbatim');
  assert.strictEqual(st.src_dropped, 200 - LIMIT, 'src_dropped counts dropped bumps');

  // дневное окно ограничено так же (иначе last7 растёт линейно)
  const day = kvValue(today());
  assert.ok(srcKeys(day.leads).length <= LIMIT, `daily leads: <=${LIMIT} src keys, got ${srcKeys(day.leads).length}`);

  // публичный payload: 200, формат прежний, размер не растёт линейно
  let r = await req('/api/tarot/stats.json');
  assert.strictEqual(r.status, 200, 'stats.json is public');
  const pub = await r.json();
  assert.ok(Object.keys(pub.leads).length <= LIMIT + 1, 'public leads bounded');
  assert.deepStrictEqual(Object.keys(pub).sort(), ['checkouts', 'last7', 'leads', 'paid', 'visits'], 'public format unchanged');
  const size1 = JSON.stringify(pub).length;

  for (let i = 200; i < 600; i++) await post('/api/tarot/reading', { question: 'q', src: 's' + i });
  const pub2 = await (await req('/api/tarot/stats.json')).json();
  const grew = JSON.stringify(pub2).length - size1;
  assert.ok(grew < 200, `public payload stays bounded: ${size1} -> ${size1 + grew} bytes`);
  assert.strictEqual(pub2.leads.other, 600 - LIMIT, 'all overflow lands in other');

  // уже известный src по-прежнему считается поимённо; мусорный src — other, но не dropped
  await post('/api/tarot/reading', { question: 'q', src: 's0' });
  const before = kvValue('tarot:stats').src_dropped;
  await post('/api/tarot/reading', { question: 'q', src: '<script>' });
  const st2 = kvValue('tarot:stats');
  assert.strictEqual(st2.leads.s0, 2, 'known src keeps counting');
  assert.strictEqual(st2.src_dropped, before, 'invalid src is not a drop');

  console.log('test_tarot_src_cap OK');
} finally {
  srv.close();
}
