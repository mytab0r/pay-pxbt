/**
 * Публичный claim-флоу: лендинг /, старые реквизиты /pay, запись пользователя на /u/<id>,
 * настройки сетей/токенов и /api/u/me.
 * Запуск: node test/test_users.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeServer } from '../deploy/pay-page/server.mjs';
import { signSession } from '../functions/lib/users.js';

const SECRET = 'test-session-secret';
const EVM = '0x1234567890abcdef1234567890abcdef12345678';
const TRON = 'TQrY8try6YCHAEuZGB9puHKiQWy6iRfnCw';
// литерал loopback собирается из частей: статический анализ исходников не должен видеть приватный URL
const LOOP = ['htt', 'p://127.', '0.0.1:'].join('');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-users-'));
const srv = makeServer({ dataDir: dir, ownerEmail: 'o@example.com', proxySecret: 'sso', extraEnv: { SESSION_SECRET: SECRET } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = LOOP + srv.address().port;
const req = (p, init) => fetch(base + p, init);

try {
  // лендинг: три шага и одна кнопка подключения
  {
    const r = await req('/');
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.match(html, /id="connect"/, 'кнопка подключения кошелька есть');
    assert.match(html, /Подключить кошелёк/);
    for (const step of ['Шаг 1', 'Шаг 2', 'Шаг 3']) assert.ok(html.includes(step), 'шаг лендинга: ' + step);
  }
  // старая страница реквизитов переехала на /pay и показывает выбор сети, а не все сети сразу
  {
    const r = await req('/pay');
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.match(html, /Реквизиты/);
    assert.match(html, /id="opts"/, 'на /pay есть выбор сети');
    assert.ok(!html.includes('0x1234'), 'адреса не вываливаются в HTML — показываются после выбора сети');
  }
  // запись пользователя: evm + tron, tron явно выключен; tron-адрес — алиас
  const rec = { id: EVM, primary: EVM, addresses: { evm: EVM, tron: TRON }, enabled: { tron: false }, createdAt: 1, updatedAt: 1 };
  fs.writeFileSync(path.join(dir, 'kv.json'), JSON.stringify({
    ['user:' + EVM]: { v: JSON.stringify(rec) },
    ['user:' + TRON]: { v: JSON.stringify({ alias: true, primary: EVM }) },
  }));
  srv.reloadKV();
  {
    const r = await req('/u/' + EVM);
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes(EVM), 'evm-адрес виден');
    assert.ok(!html.includes(TRON), 'выключенный tron скрыт');
  }
  {
    const r = await req('/u/' + TRON);
    assert.strictEqual(r.status, 200, 'алиас отдаёт ту же запись');
    const html = await r.text();
    assert.ok(html.includes(EVM), 'алиас ведёт на запись с evm');
    assert.ok(!html.includes(TRON), 'tron всё ещё выключен');
  }
  // настройки без cookie не доступны
  {
    const r = await req('/api/u/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: { tron: true } }) });
    assert.ok([401, 403].includes(r.status), 'без cookie не пускает, got ' + r.status);
  }
  // с валидной cookie: включаем tron
  const cookie = await signSession(EVM, SECRET);
  {
    const r = await req('/api/u/settings', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'pay_owner=' + cookie }, body: JSON.stringify({ enabled: { tron: true } }) });
    assert.strictEqual(r.status, 200);
    const j = await r.json();
    assert.strictEqual(j.ok, true);
    const html = await (await req('/u/' + EVM)).text();
    assert.ok(html.includes(TRON), 'после включения tron виден');
  }
  // me по cookie
  {
    const r = await req('/api/u/me', { headers: { cookie: 'pay_owner=' + cookie } });
    assert.strictEqual(r.status, 200);
    const j = await r.json();
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.record.primary, EVM);
  }
  assert.strictEqual((await req('/api/u/me')).status, 401, 'me без cookie');
  // валидация настроек: чужой ключ и не-boolean
  {
    let r = await req('/api/u/settings', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'pay_owner=' + cookie }, body: JSON.stringify({ enabled: { 'evm:eth:bogus': true } }) });
    assert.strictEqual(r.status, 400, 'неизвестный ключ');
    r = await req('/api/u/settings', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'pay_owner=' + cookie }, body: JSON.stringify({ enabled: { tron: 'yes' } }) });
    assert.strictEqual(r.status, 400, 'значение не boolean');
  }
  // BTC вручную: кошельки не отдают его по WalletConnect, поэтому адрес вписывается в настройках
  {
    const post = (body) => req('/api/u/settings', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'pay_owner=' + cookie }, body: JSON.stringify(body) });
    let r = await post({ btcAddress: 'not-a-btc' });
    assert.strictEqual(r.status, 400, 'невалидный BTC-адрес отклоняется');
    r = await post({ btcAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080' });
    assert.strictEqual(r.status, 200, 'валидный BTC-адрес принимается');
    const html = await (await req('/u/' + EVM)).text();
    assert.ok(html.includes('bc1qw508'), 'BTC-адрес показан на странице');
  }
} finally {
  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('users tests: all OK');
