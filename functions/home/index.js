/**
 * GET / — публичный лендинг: как в 3 шага получить страницу для приёма переводов.
 * EVM: injected-провайдер (расширение / dApp-браузер кошелька), иначе WalletConnect —
 * бандл /assets/paywc.js собирается из web/ и отдаётся с нашего домена (esm.sh в рантайме
 * падал у части провайдеров, из-за этого кнопка подключения «умирала»).
 * Tron/Solana/BTC — только injected-провайдеры. TON — отдельной ссылкой.
 */

const NOWALLET_HINT = 'Кошелёк не найден. Откройте эту страницу в браузере кошелька (например, SafePal → Discover) и нажмите «Подключить кошелёк».';
const inline = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const NET_CHIPS = ['USDT · Tron', 'Ethereum', 'BNB Chain', 'Polygon', 'Arbitrum', 'Base', 'Solana', 'Bitcoin', 'TON'];

export async function onRequestGet({ env = {} } = {}) {
  const projectId = env.REOWN_PROJECT_ID || '';
  const chips = NET_CHIPS.map((n) => `<span class="chip">${n}</span>`).join('');
  const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pay.pxbt.app — страница для приёма переводов</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="description" content="Подключите кошелёк и получите личную страницу с адресами для переводов во всех поддерживаемых сетях.">
<style>
 *{box-sizing:border-box}
 body{margin:0;background:#0b0d12;color:#e8eaf0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55}
 a{color:#7aa7ff;text-decoration:none} a:hover{text-decoration:underline}
 .wrap{max-width:880px;margin:0 auto;padding:0 20px}
 header{padding:18px 0;border-bottom:1px solid #1b2029;display:flex;align-items:center}
 .brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.01em}
 .dot{width:26px;height:26px;border-radius:8px;background:linear-gradient(140deg,#4f8cff,#2f5fd0);display:grid;place-items:center;font-size:13px;color:#fff}
 nav{margin-left:auto;font-size:14px;color:#8a92a3}
 .hero{padding:56px 0 32px;text-align:center}
 .hero h1{font-size:clamp(26px,5vw,42px);line-height:1.15;margin:0 0 14px;letter-spacing:-.02em}
 .hero h1 span{background:linear-gradient(90deg,#7aa7ff,#4f8cff);-webkit-background-clip:text;background-clip:text;color:transparent}
 .hero p{color:#98a1b3;max-width:560px;margin:0 auto 26px;font-size:17px}
 .cta{appearance:none;border:0;border-radius:12px;background:#4f8cff;color:#fff;font-size:17px;font-weight:650;padding:15px 34px;cursor:pointer;transition:.15s}
 .cta:hover:not(:disabled){background:#3f7df0}
 .cta:disabled{opacity:.65;cursor:default}
 .sub{margin-top:12px;font-size:13px;color:#7d8698}
 .sub button{background:none;border:0;color:#7aa7ff;cursor:pointer;font-size:13px;padding:0}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:36px 0}
 @media(max-width:680px){.grid{grid-template-columns:1fr}}
 .step{background:#14171f;border:1px solid #232936;border-radius:14px;padding:18px}
 .step b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7aa7ff;margin-bottom:6px}
 .step h3{margin:0 0 6px;font-size:16px}
 .step p{margin:0;color:#98a1b3;font-size:14px}
 .chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:8px 0 40px}
 .chip{font-size:13px;color:#c6ccd8;background:#151922;border:1px solid #232936;border-radius:999px;padding:6px 12px}
 .mock{background:#14171f;border:1px solid #232936;border-radius:16px;padding:20px;margin:0 auto 48px;max-width:420px}
 .mock .row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #1e232d;font-size:14px;color:#c6ccd8}
 .mock .row:last-child{border:0}
 .mock .addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#8a92a3}
 .mock .ok{color:#5fd08a;font-size:12px}
 #progress{margin:26px auto 0;max-width:520px;text-align:left}
 .row-p{font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:5px 0;color:#8a92a3;word-break:break-all}
 .row-p.ok{color:#5fd08a} .row-p.bad{color:#ff8f8f}
 #hint{color:#ffc266;font-size:14px;margin-top:14px;max-width:520px;margin-left:auto;margin-right:auto}
 footer{border-top:1px solid #1b2029;padding:22px 0;color:#7d8698;font-size:13px;display:flex;gap:14px;flex-wrap:wrap}
 footer span{margin-right:auto}
</style></head><body>
<div class="wrap">
<header><div class="brand"><span class="dot">₽</span>pay.pxbt.app</div><nav><a href="/pay">пример страницы</a></nav></header>

<section class="hero">
 <h1>Принимайте переводы <span>одной ссылкой</span></h1>
 <p>Подключите кошелёк — получите личную страницу с вашими адресами и QR во всех поддерживаемых сетях. Без регистрации и без сервера.</p>
 <button class="cta" id="connect">Подключить кошелёк</button>
 <div class="sub">или <button id="connect-ton">добавить TON-кошелёк</button></div>
 <div id="progress"></div>
 <div id="hint"></div>
</section>

<section class="grid">
 <div class="step"><b>Шаг 1</b><h3>Подключите кошелёк</h3><p>Расширение в браузере или приложение через WalletConnect — SafePal, MetaMask, Trust и другие.</p></div>
 <div class="step"><b>Шаг 2</b><h3>Мы соберём адреса</h3><p>Адрес один на все EVM-сети, плюс отдельные для Tron, Solana, Bitcoin и TON — если такие кошельки подключены.</p></div>
 <div class="step"><b>Шаг 3</b><h3>Отправьте ссылку</h3><p>Любой откроет <code>/u/…</code>, выберет сеть и монету, скопирует адрес или отсканирует QR. Сети и монеты настраиваются.</p></div>
</section>

<div class="chips">${chips}</div>

<div class="mock" aria-hidden="true">
 <div class="row"><span>USDT · Tron (TRC20)</span><span class="ok">выбрано</span></div>
 <div class="row"><span>Ethereum (ERC20)</span><span>USDT / USDC</span></div>
 <div class="row"><span>Base</span><span>USDC</span></div>
 <div class="row"><span class="addr">TSAc8KEWdbyS36PPd39K8DyA9dwmmdguS4</span><span>QR</span></div>
</div>

<footer><span>pay.pxbt.app — страницы для приёма переводов</span><a href="/pay">пример</a><a href="/tonconnect-manifest.json">TON Connect</a></footer>
</div>

<script>
const CHAINS = ['evm', 'tron', 'solana', 'btc'];
const PROJECT_ID = ${inline(projectId)};
const WC_CHAINS = [1, 8453, 56, 137, 42161];
const NOWALLET_HINT = ${inline(NOWALLET_HINT)};
const API_TIMEOUT = 15000;

const api = async (url, body) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), API_TIMEOUT);
  try {
    const r = await fetch(url, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body), signal: ac.signal });
    return await r.json();
  } catch (e) { throw Object.assign(new Error('сеть недоступна'), { net: true }); }
  finally { clearTimeout(t); }
};
const hexUtf8 = (s) => '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');
const rejected = (e) => e && (e.code === 4001 || /declined|reject|denied|cancel/i.test(String((e && e.message) || e)));
const nonceMsg = (nonce) => 'pay.pxbt.app: claim ' + nonce + '\\nвладелец pxbt.app';

// WalletConnect: бандл лежит на нашем домене, грузим его фоном сразу после отрисовки страницы.
let wcP = null;
function loadPayWC() {
  if (wcP) return wcP;
  wcP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/assets/paywc.js';
    s.async = true;
    s.onload = () => (window.PayWC ? resolve(window.PayWC) : reject(new Error('модуль кошелька не загрузился')));
    s.onerror = () => reject(new Error('модуль кошелька не загрузился'));
    document.head.appendChild(s);
  }).catch((e) => { wcP = null; throw e; });
  return wcP;
}
if ('requestIdleCallback' in window) requestIdleCallback(() => loadPayWC().catch(() => {}));
else setTimeout(() => loadPayWC().catch(() => {}), 800);

function injectedEvm() {
  return new Promise((res) => {
    let first = null;
    const on = (ev) => { if (!first && ev.detail && ev.detail.provider) first = ev.detail; };
    window.addEventListener('eip6963:announceProvider', on);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => { window.removeEventListener('eip6963:announceProvider', on); res(first || (window.ethereum ? { provider: window.ethereum } : null)); }, 300);
  });
}
async function wcEvm() {
  if (!PROJECT_ID) throw new Error('WalletConnect не настроен');
  if (!window.PayWC) hint.textContent = 'Загружаю список кошельков…';
  const PayWC = await loadPayWC();
  hint.textContent = '';
  const p = await PayWC.connect({ projectId: PROJECT_ID, chains: WC_CHAINS });
  const accs = (p.accounts && p.accounts.length) ? p.accounts : await p.request({ method: 'eth_accounts' });
  const address = accs && accs[0];
  if (!address) throw new Error('кошелёк не вернул адрес');
  return {
    address,
    async sign(msg) {
      try { return await p.request({ method: 'personal_sign', params: [hexUtf8(msg), address] }); }
      catch (e) { throw Object.assign(new Error('подпись отклонена'), { code: (e && e.code) || 4001 }); }
    },
  };
}
async function evmWallet() {
  const inj = await injectedEvm();
  if (inj) {
    const p = inj.provider;
    let accs;
    try { accs = await p.request({ method: 'eth_requestAccounts' }); }
    catch (e) { throw Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true }); }
    const address = accs && accs[0];
    if (!address) throw new Error('кошелёк не вернул адрес');
    return {
      address,
      async sign(msg) {
        try { return await p.request({ method: 'personal_sign', params: [hexUtf8(msg), address] }); }
        catch (e) { throw Object.assign(new Error('подпись отклонена'), { code: (e && e.code) || 4001 }); }
      },
    };
  }
  return wcEvm();
}
async function solanaWallet() {
  const p = (window.phantom && window.phantom.solana) || window.solana;
  if (!p) throw Object.assign(new Error('кошелёк не найден'), { nowallet: true });
  let res;
  try { res = await p.connect(); }
  catch (e) { throw Object.assign(new Error('подключение отклонено'), { code: (e && e.code) || 4001, connect: true }); }
  const pk = (res && res.publicKey) || p.publicKey;
  if (!pk) throw new Error('кошелёк не вернул адрес');
  return {
    address: pk.toString(),
    async sign(msg) {
      const s = await p.signMessage(new TextEncoder().encode(msg), 'utf8');
      return btoa(String.fromCharCode(...(s.signature || s)));
    },
  };
}
async function tronWallet() {
  const p = window.tron || window.tronLink || (window.tronWeb ? { tronWeb: window.tronWeb } : null);
  if (!p) throw Object.assign(new Error('кошелёк не найден'), { nowallet: true });
  if (p.request) {
    let r;
    try { r = await p.request({ method: p === window.tron ? 'eth_requestAccounts' : 'tron_requestAccounts' }); }
    catch (e) { throw Object.assign(new Error('подключение отклонено'), { code: (e && e.code) || 4001, connect: true }); }
    if (r && (r.code === 4001 || r.code === 4000)) throw Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true });
  }
  const tw = p.tronWeb || window.tronWeb;
  if (!tw || !tw.defaultAddress || !tw.defaultAddress.base58) throw new Error('TronLink заблокирован: разблокируйте кошелёк');
  return { address: tw.defaultAddress.base58, async sign(msg) { return tw.trx.signMessageV2(msg); } };
}
async function btcWallet() {
  const provider = (window.phantom && window.phantom.bitcoin) || window.unisat || (window.okxwallet && window.okxwallet.bitcoin) || window.xverse;
  if (!provider) throw Object.assign(new Error('кошелёк не найден'), { nowallet: true });
  let accounts;
  try {
    accounts = (await (provider.requestAccounts ? provider.requestAccounts() : provider.request({ method: 'requestAccounts' }))) || [];
  } catch (e) {
    throw Object.assign(new Error('подключение отклонено'), { code: (e && e.code) || 4001, connect: true });
  }
  const toAddr = (a) => (typeof a === 'string' ? a : a && a.address);
  const bech32 = accounts.map(toAddr).find((a) => a && a.startsWith('bc1q'));
  if (!bech32) throw new Error('только bc1q (P2WPKH) адреса принимаются');
  return {
    address: bech32,
    async sign(msg) {
      try {
        if (provider.signMessage) return await provider.signMessage(msg, bech32);
        return await provider.request({ method: 'signMessage', params: [msg, bech32] });
      } catch (e) { throw Object.assign(new Error('подпись отклонена'), { code: (e && e.code) || 4001 }); }
    },
  };
}
let tonConnectUiPromise = null;
function getTonConnectUi() {
  if (!tonConnectUiPromise) {
    tonConnectUiPromise = import('https://esm.sh/@tonconnect/ui@2.2.2')
      .then(({ TonConnectUI }) => new TonConnectUI({ manifestUrl: location.origin + '/tonconnect-manifest.json', buttonRootId: 'ton-connect-button' }));
  }
  return tonConnectUiPromise;
}
async function tonWallet(message) {
  const ui = await getTonConnectUi();
  ui.setConnectRequestParameters({ state: 'ready', value: { tonProof: message } });
  if (ui.connected) await ui.disconnect().catch(() => {});
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsub(); reject(Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true })); }, 180000);
    const unsub = ui.onStatusChange((wallet) => {
      if (!wallet) return;
      clearTimeout(timeout); unsub();
      const proofItem = wallet.connectItems && wallet.connectItems.tonProof;
      if (!proofItem || !('proof' in proofItem)) { reject(new Error('кошелёк не вернул ton_proof')); return; }
      resolve({
        address: wallet.account.address,
        async sign() { return JSON.stringify({ address: wallet.account.address, stateInit: wallet.account.walletStateInit, proof: proofItem.proof }); },
      });
    });
    ui.connect().catch((e) => { clearTimeout(timeout); unsub(); reject(e); });
  });
}
const WALLETS = { evm: evmWallet, solana: solanaWallet, tron: tronWallet, ton: tonWallet, btc: btcWallet };

const btn = document.getElementById('connect');
const tonBtn = document.getElementById('connect-ton');
const progress = document.getElementById('progress');
const hint = document.getElementById('hint');
let myUrl = null;

const short = (a) => (a && a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-6) : a);
function addRow(chain) {
  const d = document.createElement('div');
  d.className = 'row-p';
  d.textContent = '… ' + chain;
  progress.appendChild(d);
  return d;
}
function finishRow(d, ok, text) {
  d.className = 'row-p ' + (ok ? 'ok' : 'bad');
  d.textContent = (ok ? '✔ ' : '✘ ') + text;
}
function humanError(e) {
  if (e && e.net) return 'сеть недоступна';
  if (rejected(e)) return e.connect ? 'подключение отклонено в кошельке' : 'подпись отклонена в кошельке';
  if (e && e.nowallet) return 'кошелёк не найден';
  const m = String((e && e.message) || e);
  if (/fetch|module|import|load/i.test(m)) return 'не удалось загрузить модуль кошелька — проверьте сеть и попробуйте ещё раз';
  return m;
}

async function claim(chain) {
  const d = addRow(chain);
  try {
    let w, nonce, message;
    if (chain === 'ton') {
      ({ nonce, message } = await api('/api/u/nonce', { chain }));
      if (!nonce) throw new Error('сервер не выдал nonce');
      w = await tonWallet(message || nonceMsg(nonce));
    } else {
      w = await WALLETS[chain]();
      ({ nonce, message } = await api('/api/u/nonce', { chain }));
      if (!nonce) throw new Error('сервер не выдал nonce');
    }
    const address = w.address;
    if (!address) throw new Error('кошелёк не вернул адрес');
    const signature = await w.sign(message || nonceMsg(nonce));
    const j = await api('/api/u/claim', { chain, address, signature, nonce });
    if (!j.ok) throw new Error(j.error || 'отказ сервера');
    finishRow(d, true, chain + ': ' + short(address));
    if (!myUrl) { myUrl = j.url; btn.textContent = 'Открыть мою страницу'; }
    return { ok: true };
  } catch (e) {
    // BTC и Tron через WalletConnect не приходят — путь один: вписать адрес вручную в настройках.
    const text = (chain === 'btc' || chain === 'tron') && e && e.nowallet
      ? 'кошелёк не найден — адрес можно добавить вручную в настройках страницы'
      : humanError(e);
    finishRow(d, false, chain + ': ' + text);
    return { ok: false, nowallet: !!(e && e.nowallet) };
  }
}

btn.onclick = async () => {
  if (myUrl) { location.href = myUrl; return; }
  btn.disabled = true;
  btn.textContent = 'Подключаю…';
  progress.textContent = '';
  hint.textContent = '';
  let okCount = 0, noWalletCount = 0;
  try {
    for (const chain of CHAINS) {
      const r = await claim(chain);
      if (r.ok) okCount++;
      else if (r.nowallet) noWalletCount++;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = myUrl ? 'Открыть мою страницу' : 'Подключить кошелёк';
  }
  if (!okCount && noWalletCount === CHAINS.length) hint.textContent = NOWALLET_HINT;
  else if (okCount) hint.textContent = 'Готово: адреса сохранены. Откройте свою страницу и выберите сети и монеты.';
};

tonBtn.onclick = async () => {
  tonBtn.disabled = true;
  const r = await claim('ton');
  tonBtn.disabled = false;
  if (r.ok) tonBtn.textContent = 'TON добавлен';
};

fetch('/api/u/me').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (j && j.ok && j.record && j.record.primary) {
    myUrl = '/u/' + encodeURIComponent(j.record.primary);
    btn.textContent = 'Открыть мою страницу';
  }
}).catch(() => {});
</scr` + `ipt>
<div id="ton-connect-button" hidden></div>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
