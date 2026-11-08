/**
 * WalletConnect для pay.pxbt.app. Собирается esbuild'ом в один файл и отдаётся с нашего
 * домена (/assets/paywc.js): esm.sh в рантайме ненадёжен — у части провайдеров импорт
 * модуля просто падает, и кнопка подключения «мертва».
 *
 * Одна сессия несёт несколько namespace'ов сразу: EVM (eip155) + Solana. У SafePal в
 * WalletConnect есть и eip155, и solana — оба адреса приходят из одного подключения.
 * Bitcoin (bip122) и Tron кошельки через WalletConnect не отдают, эти адреса вписываются
 * вручную в настройках страницы.
 */
import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';

const SOLANA_CHAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const EVM_CHAINS = ['eip155:1', 'eip155:8453', 'eip155:56', 'eip155:137', 'eip155:42161'];

const metadata = () => ({
  name: 'pay.pxbt.app',
  description: 'Страница для приёма переводов',
  url: location.origin,
  icons: [location.origin + '/favicon.svg'],
});

/** Аккаунты namespace'а из сессии: 'eip155:1:0xabc' -> '0xabc'. */
function accountsOf(provider, key) {
  const ns = provider.session && provider.session.namespaces && provider.session.namespaces[key];
  if (!ns) return [];
  return (ns.accounts || []).map((a) => String(a).split(':').slice(2).join(':'));
}

/** Хвосты прошлых сессий в localStorage блокируют новую попытку («полубитое» состояние). */
function clearWalletConnectStorage() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('wc@') || k.startsWith('walletconnect')) localStorage.removeItem(k);
    }
  } catch (e) {}
}

const CONNECT_TIMEOUT = 180000;

window.PayWC = {
  /**
   * Одно подключение -> { evm, solana }. Каждое поле либо { address, sign }, либо null,
   * если кошелёк эту цепочку не умеет.
   */
  async connect({ projectId }) {
    // Каждая попытка начинается с чистого состояния: после отмены WC оставлял
    // недописанную сессию, и следующее подключение молча зависало.
    clearWalletConnectStorage();
    const provider = await UniversalProvider.init({ projectId, metadata: metadata() });
    // Страховка на случай, если хранилище пережило очистку: полусессия блокирует новую попытку.
    if (provider.session) { try { await provider.disconnect(); } catch (e) {} }
    const modal = new WalletConnectModal({ projectId, themeMode: 'dark' });
    provider.on('display_uri', (uri) => modal.openModal({ uri }));

    let timer;
    try {
      await Promise.race([
        provider.connect({
          // eip155 обязателен; solana — optional: MetaMask и другие EVM-only кошельки
          // иначе отклонили бы всю сессию.
          namespaces: {
            eip155: { methods: ['eth_sendTransaction', 'personal_sign', 'eth_sign'], chains: EVM_CHAINS, events: ['accountsChanged', 'chainChanged'] },
          },
          optionalNamespaces: {
            solana: { methods: ['solana_signMessage', 'solana_signTransaction'], chains: [SOLANA_CHAIN], events: ['accountsChanged'] },
          },
        }),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(Object.assign(new Error('подключение отклонено'), { code: 4001, connect: true })), CONNECT_TIMEOUT);
        }),
      ]);
    } catch (e) {
      // сбрасываем всё, что могло остаться: следующая попытка должна быть с нуля
      try { await provider.disconnect(); } catch (e2) {}
      clearWalletConnectStorage();
      throw e;
    } finally {
      clearTimeout(timer);
      try { modal.closeModal(); } catch (e) {}
    }

    const evmAddr = accountsOf(provider, 'eip155')[0] || null;
    const solAddr = accountsOf(provider, 'solana')[0] || null;

    return {
      evm: evmAddr && {
        address: evmAddr,
        async sign(msg) {
          return provider.request({ chainId: 'eip155:1', method: 'personal_sign', params: [hexUtf8(msg), evmAddr] }, 'eip155:1');
        },
      },
      solana: solAddr && {
        address: solAddr,
        async sign(msg) {
          // сервер проверяет ed25519 по сырым байтам сообщения, подпись — base64
          const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(msg)));
          const res = await provider.request({ chainId: SOLANA_CHAIN, method: 'solana_signMessage', params: { message: b64, pubkey: solAddr } }, SOLANA_CHAIN);
          return typeof res === 'string' ? res : res && (res.signature || res.signedMessage);
        },
      },
      provider,
    };
  },
};

function hexUtf8(s) {
  return '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');
}
