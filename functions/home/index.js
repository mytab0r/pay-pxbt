/**
 * GET / — публичный лендинг: как в 3 шага получить страницу для приёма переводов.
 * Одна кнопка последовательно подключает injected-провайдеры (evm, tron, solana, btc, ton):
 * nonce -> подпись -> /api/u/claim. AppKit/WalletConnect намеренно не подключаем:
 * висящая WC-сессия дизейблит кошельки в модалке. Клиентский JS взят из functions/admin/index.js.
 */

const NOWALLET_HINT = 'Кошелёк не найден. Откройте эту страницу в браузере кошелька (например, SafePal → Discover) и нажмите «Подключить кошелёк».';
const inline = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export async function onRequestGet({ env = {} } = {}) {
  const projectId = env.REOWN_PROJECT_ID || '';
  const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pay.pxbt.app — страница для приёма переводов</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:16px;background:#0f1115;color:#e6e6e6}
 .card{background:#171a21;border-radius:12px;padding:20px;margin-top:16px}
 h1{font-size:20px;margin:8px 0 2px} .muted{color:#8a92a3;font-size:13px;line-height:1.5}
 .steps{margin:12px 0 0;padding-left:20px;line-height:1.55}
 .steps li{margin:8px 0}
 code{background:#10131a;padding:1px 5px;border-radius:5px}
 button.act{width:100%;margin-top:16px;padding:14px;border:0;border-radius:10px;background:#4f8cff;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
 button.act:disabled{opacity:.6;cursor:default}
 button.act.secondary{margin-top:8px;background:#1c2029;border:1px solid #2a2f3a;font-weight:500}
 #progress{margin-top:12px}
 .row{font-family:monospace;font-size:13px;padding:4px 0;word-break:break-all;color:#8a92a3}
 .row.ok{color:#7ee2a8} .row.bad{color:#ff8a8a}
 #hint{color:#ffb84d;font-size:13px;margin-top:10px;line-height:1.5}
</style></head><body>
<div class="card">
 <h1>Переводы на свою страницу</h1>
 <div class="muted">Получайте переводы в любой поддерживаемой сети — без регистрации и без сервера.</div>
 <ol class="steps">
  <li><b>Шаг 1.</b> Подключите кошелёк.</li>
  <li><b>Шаг 2.</b> Мы соберём адреса во всех поддерживаемых сетях и сохраним их.</li>
  <li><b>Шаг 3.</b> Получите ссылку <code>/u/…</code> — отправьте её кому угодно, а в настройках выберите сети и монеты.</li>
 </ol>
 <button class="act" id="connect">Подключить кошелёк</button>
 <button class="act secondary" id="connect-ton">Добавить TON-кошелёк</button>
 <div id="progress"></div>
 <div id="hint"></div>
</div>
<div id="ton-connect-button" hidden></div>
<script>
const CHAINS = ['evm', 'tron', 'solana', 'btc'];
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

// EVM: только injected-провайдер (EIP-6963 / window.ethereum). Без WalletConnect.
function injectedEvm() {
  return new Promise((res) => {
    let first = null;
    const on = (ev) => { if (!first && ev.detail && ev.detail.provider) first = ev.detail; };
    window.addEventListener('eip6963:announceProvider', on);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => { window.removeEventListener('eip6963:announceProvider', on); res(first || (window.ethereum ? { provider: window.ethereum } : null)); }, 300);
  });
}
// EVM: сначала injected-провайдер (расширение на десктопе или dApp-браузер кошелька).
// Если его нет — WalletConnect (AppKit): список приложений, выбор SafePal/MetaMask и т.д.
// Модули AppKit грузятся с esm.sh ~30 с, поэтому предзагружаем их сразу при открытии страницы:
// иначе кнопка полминуты выглядит «мёртвой» — это и было жалобой владельца.
const APPKIT_NETS = [
  { id: 1, name: 'Ethereum', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://eth.llamarpc.com'] } } },
  { id: 8453, name: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://mainnet.base.org'] } } },
];
const PROJECT_ID = ${inline(projectId)};
let appkitMods = null, appkitModal = null;
function preloadAppkit() {
  if (appkitMods || !PROJECT_ID) return;
  appkitMods = Promise.all([
    import('https://esm.sh/@reown/appkit@1.7.18'),
    import('https://esm.sh/@reown/appkit-adapter-wagmi@1.7.18'),
  ]).catch((e) => { appkitMods = null; throw e; });
}
preloadAppkit();
async function getAppkitModal() {
  if (appkitModal) return appkitModal;
  if (!PROJECT_ID) throw new Error('WalletConnect не настроен (нет projectId)');
  preloadAppkit();
  const [{ createAppKit }, { WagmiAdapter }] = await appkitMods;
  const wagmiAdapter = new WagmiAdapter({ networks: APPKIT_NETS, projectId: PROJECT_ID });
  appkitModal = createAppKit({ adapters: [wagmiAdapter], networks: APPKIT_NETS, projectId: PROJECT_ID, features: { analytics: false, email: false, socials: false, swaps: false, onramp: false } });
  return appkitModal;
}
async function walletConnectEvm() {
  if (!appkitModal) hint.textContent = 'Загружаю список кошельков…';
  const modal = await getAppkitModal();
  hint.textContent = '';
  const addr = () => { try { const a = modal.getAccount('eip155'); return a && a.isConnected && a.address; } catch (e) { return null; } };
  if (!addr()) {
    // Висящая WC-сессия без аккаунта дизейблит кошельки в модалке (AppKit: hasAnyConnection). Сбрасываем.
    try { await modal.disconnect(); } catch (e) {}
    await modal.open();
    for (let t = 0; !addr(); t += 500) {
      if (!modal.getState().open) throw Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true });
      if (t > 180000) throw Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true });
      await new Promise((r) => setTimeout(r, 500));
    }
    try { await modal.close(); } catch (e) {}
  }
  const p = modal.getWalletProvider();
  if (!p) throw new Error('WalletConnect: провайдер не получен');
  const address = addr();
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
  return walletConnectEvm();
}

// Solana: window-провайдер (SafePal/Phantom в dApp-браузере, расширение на десктопе)
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

// Tron: TIP-1193 напрямую (TronLink/SafePal dApp-браузер)
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

// TON: TON Connect + ton_proof. payload proof'а = выданный сервером nonce (anti-replay).
let tonConnectUiPromise = null;
function getTonConnectUi() {
  if (!tonConnectUiPromise) {
    tonConnectUiPromise = (window.__TonConnectUIClass
      ? Promise.resolve({ TonConnectUI: window.__TonConnectUIClass })
      : import('https://esm.sh/@tonconnect/ui@2.2.2')
    ).then(({ TonConnectUI }) =>
      new TonConnectUI({ manifestUrl: 'https://pay.pxbt.app/tonconnect-manifest.json', buttonRootId: 'ton-connect-button' })
    );
  }
  return tonConnectUiPromise;
}
async function tonWallet(message) {
  const ui = await getTonConnectUi();
  ui.setConnectRequestParameters({ state: 'ready', value: { tonProof: message } });
  if (ui.connected) await ui.disconnect().catch(() => {});
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true }));
    }, 180000);
    const unsub = ui.onStatusChange((wallet) => {
      if (!wallet) return;
      clearTimeout(timeout);
      unsub();
      const proofItem = wallet.connectItems && wallet.connectItems.tonProof;
      if (!proofItem || !('proof' in proofItem)) {
        reject(new Error('кошелёк не вернул ton_proof'));
        return;
      }
      resolve({
        address: wallet.account.address,
        async sign() {
          return JSON.stringify({
            address: wallet.account.address,
            stateInit: wallet.account.walletStateInit,
            proof: proofItem.proof,
          });
        },
      });
    });
    ui.connect().catch((e) => { clearTimeout(timeout); unsub(); reject(e); });
  });
}

// BTC: injected-провайдеры (Phantom/Unisat/OKX/Xverse). Только bc1q (P2WPKH).
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

const WALLETS = { evm: evmWallet, solana: solanaWallet, tron: tronWallet, ton: tonWallet, btc: btcWallet };
const btn = document.getElementById('connect');
const progress = document.getElementById('progress');
const hint = document.getElementById('hint');
let myUrl = null;

const short = (a) => (a && a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-6) : a);
function addRow(chain) {
  const d = document.createElement('div');
  d.className = 'row';
  d.textContent = '… ' + chain;
  progress.appendChild(d);
  return d;
}
function finishRow(d, ok, text) {
  d.className = 'row ' + (ok ? 'ok' : 'bad');
  d.textContent = (ok ? '✔ ' : '✘ ') + text;
}

async function claim(chain) {
  const d = addRow(chain);
  try {
    let w, nonce, message;
    if (chain === 'ton') {
      // TON Connect подписывает nonce как ton_proof payload при подключении: nonce нужен заранее.
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
    if (!myUrl) {
      myUrl = j.url;
      btn.textContent = 'Открыть мою страницу';
    }
    return { ok: true };
  } catch (e) {
    if (e && e.net) finishRow(d, false, chain + ': сеть недоступна');
    else if (rejected(e)) finishRow(d, false, chain + ': ' + (e.connect ? 'подключение отклонено в кошельке' : 'подпись отклонена в кошельке'));
    else if (e && e.nowallet) finishRow(d, false, chain + ': кошелёк не найден');
    else finishRow(d, false, chain + ': ' + ((e && e.message) || String(e)));
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
  // TON Connect открывает модалку всегда, поэтому вынесен в отдельную кнопку:
  // иначе у кого нет TON-кошелька, основной поток висел бы до 3 минут.
  if (!okCount && noWalletCount === CHAINS.length) hint.textContent = NOWALLET_HINT;
  else if (okCount) hint.textContent = 'Готово: адреса сохранены. Откройте свою страницу и выберите сети и монеты.';
};

const tonBtn = document.getElementById('connect-ton');
tonBtn.onclick = async () => {
  tonBtn.disabled = true;
  const r = await claim('ton');
  tonBtn.disabled = false;
  if (r.ok && myUrl) tonBtn.textContent = 'TON добавлен';
};

// Возвращающийся владелец: cookie уже есть — сразу ведём на его страницу.
fetch('/api/u/me').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (j && j.ok && j.record && j.record.primary) {
    myUrl = '/u/' + encodeURIComponent(j.record.primary);
    btn.textContent = 'Открыть мою страницу';
  }
}).catch(() => {});
</scr` + `ipt>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
