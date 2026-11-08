/**
 * GET /u/<id> — личная страница оплаты: плательщик выбирает сеть (и монету для EVM), получает адрес и QR.
 * <id> — адрес получателя или алиас записи пользователя (см. lib/users.js).
 * Есть запись — рендерим все её адреса с их сетями/токенами, отфильтрованные enabled.
 * Записи нет — прежнее поведение: id = адрес, все сети его цепочки.
 * Владелец (валидная cookie pay_owner) видит блок «⚙ Настройки» с чекбоксами сетей и токенов.
 * Неизвестный/битый id -> HTML 404 (не пустой экран, не 500).
 * Сети и монеты — из lib/networks.js, не хардкод здесь.
 */
import { validAddress } from '../lib/config.js';
import { networksFor } from '../lib/networks.js';
import { loadUser, userNetworks, isEnabled, userFromRequest } from '../lib/users.js';

const QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
// Формы адресов разных цепочек не пересекаются, порядок — только для читаемости.
const CHAINS = ['tron', 'btc', 'ton', 'solana', 'evm'];

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inline = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const BASE_CSS = `body{font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:16px;background:#0f1115;color:#e6e6e6}
 .card{background:#171a21;border-radius:12px;padding:20px;margin-top:16px}
 .muted{color:#8a92a3;font-size:13px} h1{font-size:20px;margin:0 0 6px} a{color:#4f8cff}`;

/** Чекбоксы владельца: все сети/токены пользователя, отмечено по enabled. */
function settingsHtml(rec) {
  const rows = [];
  for (const n of userNetworks(rec)) {
    rows.push(`<label class="chk"><input type="checkbox" data-key="${esc(n.id)}"${isEnabled(rec, n.id) ? ' checked' : ''}>${esc(n.label)}</label>`);
    for (const t of n.tokens || []) {
      const key = n.id + ':' + t.id;
      rows.push(`<label class="chk sub"><input type="checkbox" data-key="${esc(key)}"${isEnabled(rec, key) ? ' checked' : ''}>${esc(t.label)}</label>`);
    }
  }
  const btc = (rec.addresses && rec.addresses.btc) || '';
  return `<details class="settings"><summary>⚙ Настройки</summary><div id="settings">${rows.join('')}
 <div class="btcline"><label for="btc-addr">BTC-адрес (bc1q…)</label>
  <input id="btc-addr" type="text" inputmode="text" autocomplete="off" spellcheck="false" value="${esc(btc)}" placeholder="bc1q…">
  <div class="muted">Кошельки не отдают Bitcoin через WalletConnect — адрес вписывается вручную.</div></div>
 <button class="act" id="save-settings">Сохранить</button><div class="muted" id="save-msg"></div></div></details>`;
}

/**
 * Одна страница оплаты для /u/<id> и /pay: сверху выбор сети (для EVM — ещё и монеты),
 * ниже — только реквизиты выбранного варианта. Все сети карточками не вываливаем.
 */
export function renderPaymentPage({ nets, short, subtitle, settings = '' }) {
  const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Оплата на ${esc(short)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script src="${QR_JS}"></scr` + `ipt>
<style>${BASE_CSS}
 .opt{display:block;width:100%;margin:8px 0;padding:14px;border:1px solid #2a2f3a;border-radius:10px;background:#1c2029;color:#e6e6e6;font-size:16px;text-align:left;cursor:pointer}
 .opt[aria-pressed=true]{border-color:#4f8cff;background:#203050}
 .opt small{color:#8a92a3;margin-left:8px}
 .tok{display:inline-block;width:auto;margin:6px 6px 0 0;padding:8px 14px;border:1px solid #2a2f3a;border-radius:8px;background:#1c2029;color:#e6e6e6;font-size:14px;cursor:pointer}
 .tok[aria-pressed=true]{border-color:#4f8cff;background:#203050}
 .warn{color:#ffb84d;font-weight:600;margin:12px 0;overflow-wrap:anywhere}
 .addr{font-family:monospace;word-break:break-all;background:#10131a;padding:10px;border-radius:8px}
 button.act{width:100%;margin-top:10px;padding:12px;border:0;border-radius:10px;background:#4f8cff;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
 button.act:disabled{opacity:.6;cursor:default}
 #qr img{margin:12px auto;display:block;max-width:100%;filter:invert(1) hue-rotate(180deg)}
 .hidden{display:none}
 .settings{margin-top:14px;border-top:1px solid #2a2f3a;padding-top:10px}
 summary{cursor:pointer;color:#4f8cff;font-size:14px}
 .chk{display:block;margin:8px 0;font-size:14px}
 .chk.sub{margin-left:22px;color:#c9ceda}
 .chk input{transform:scale(1.2);margin-right:8px}
 .btcline{margin:14px 0 4px;font-size:14px}
 .btcline label{display:block;margin-bottom:6px}
 .btcline input{width:100%;padding:10px;border-radius:8px;border:1px solid #2a2f3a;background:#10131a;color:#e6e6e6;font-family:monospace;font-size:13px}
</style></head><body>
<div class="card"><h1>Оплата</h1>
<div class="muted">${esc(subtitle || ('Получатель ' + short))} · выберите сеть — покажу адрес и QR.</div>
${settings}</div>
<div class="card">
 <div id="opts"></div>
 <div id="details" class="hidden">
  <div id="toks"></div>
  <p class="warn"></p>
  <div class="addr" id="addr"></div>
  <div id="qr"></div>
  <button class="act" id="copy">Скопировать адрес</button>
  <div class="muted" id="done" style="margin-top:8px"></div>
 </div>
</div>
<script>
const NETS = ${inline(nets)};
const box = document.getElementById('opts');
let sel = null, tok = null;
if (!NETS.length) {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = 'Сети не выбраны.';
  box.appendChild(p);
}
for (const c of NETS) {
  const b = document.createElement('button');
  b.className = 'opt'; b.setAttribute('aria-pressed', 'false'); b.textContent = c.label;
  if (c.warn) { const s = document.createElement('small'); s.textContent = c.warn; b.appendChild(s); }
  b.onclick = () => show(c, b);
  box.appendChild(b);
}
function show(c, b) {
  for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
  sel = c; tok = c.tokens ? c.tokens[0] : null;
  const tk = document.getElementById('toks'); tk.innerHTML = '';
  document.getElementById('details').classList.remove('hidden');
  for (const t of c.tokens || []) {
    const tb = document.createElement('button');
    tb.className = 'tok'; tb.textContent = t.label; tb.setAttribute('aria-pressed', String(t === tok));
    tb.onclick = () => { tok = t; for (const x of tk.children) x.setAttribute('aria-pressed', String(x === tb)); paint(); };
    tk.appendChild(tb);
  }
  paint();
}
function paint() {
  const addr = sel.address;
  const parts = ['Отправляйте ТОЛЬКО ' + (tok ? tok.label + ' в сети ' : '') + sel.net];
  if (sel.warn) parts.push(sel.warn);
  if (tok && tok.contract) parts.push('контракт токена: ' + tok.contract);
  document.querySelector('.warn').textContent = '⚠ ' + parts.join(' — ') + ' — при переводе из другой сети средства будут потеряны.';
  document.getElementById('addr').textContent = addr;
  // CDN с QR-библиотекой может не загрузиться: адрес важнее картинки, падать нельзя.
  if (typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M'); qr.addData(addr); qr.make();
  document.getElementById('qr').innerHTML = qr.createImgTag(4, 8);
}
document.getElementById('copy').onclick = async () => {
  if (!sel) return;
  const addr = sel.address;
  try { await navigator.clipboard.writeText(addr); document.getElementById('done').textContent = 'Адрес скопирован.'; }
  catch (e) { document.getElementById('done').textContent = addr; }
};
const saveBtn = document.getElementById('save-settings');
if (saveBtn) saveBtn.onclick = async () => {
  const enabled = {};
  for (const cb of document.querySelectorAll('#settings input[data-key]')) enabled[cb.dataset.key] = cb.checked;
  const payload = { enabled };
  const btcInput = document.getElementById('btc-addr');
  if (btcInput) payload.btcAddress = btcInput.value.trim();
  const msg = document.getElementById('save-msg');
  saveBtn.disabled = true;
  try {
    const r = await fetch('/api/u/settings', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) location.reload();
    else msg.textContent = j.error || 'ошибка сохранения';
  } catch (e) {
    msg.textContent = 'сеть недоступна';
  } finally { saveBtn.disabled = false; }
};
</scr` + `ipt>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet({ params, request, env = {} }) {
  const id = String((params && params.id) || '');
  const rec = await loadUser(env, id);
  let nets = [];
  if (rec) {
    for (const n of userNetworks(rec)) {
      if (!isEnabled(rec, n.id)) continue;
      if (n.tokens) {
        const tokens = n.tokens.filter((t) => isEnabled(rec, n.id + ':' + t.id));
        if (!tokens.length) continue;
        nets.push({ ...n, tokens });
      } else {
        nets.push(n);
      }
    }
  } else {
    const chain = CHAINS.find((c) => validAddress(c, id));
    nets = chain ? networksFor(chain).map((n) => ({ ...n, address: id })) : [];
    if (!nets.length) return notFound();
  }
  const owner = await userFromRequest(env, request);
  const isOwner = !!(rec && owner && owner.primary === rec.primary);
  const short = id.length > 16 ? id.slice(0, 8) + '…' + id.slice(-6) : id;
  return renderPaymentPage({ nets, short, settings: isOwner ? settingsHtml(rec) : '' });
}

function notFound() {
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Страница не найдена</title>
<style>${BASE_CSS}</style></head><body>
<div class="card"><h1>Страница не найдена</h1>
<div class="muted">Ссылка на оплату не существует или адрес получателя в ней некорректный.</div>
<p><a href="/">Реквизиты pay.pxbt.app</a></p></div>
</body></html>`;
  return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
