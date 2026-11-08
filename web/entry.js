/**
 * WalletConnect для pay.pxbt.app. Собирается esbuild'ом в один файл и отдаётся с нашего
 * домена (/assets/paywc.js): esm.sh в рантайме ненадёжен — у части провайдеров импорт
 * модуля просто падает, и кнопка подключения «мертва».
 *
 * window.PayWC.connect({ projectId, chains }) -> EIP-1193 provider с уже открытой сессией.
 * Модалка со списком кошельков (SafePal, MetaMask, Trust…) — часть бандла, showQrModal.
 *
 * Bitcoin сюда не входит: у SafePal и большинства кошельков в WalletConnect нет namespace
 * bip122, поэтому BTC-адрес на странице задаётся вручную в настройках.
 */
import { EthereumProvider } from '@walletconnect/ethereum-provider';

window.PayWC = {
  async connect({ projectId, chains }) {
    const provider = await EthereumProvider.init({
      projectId,
      chains: [1],
      optionalChains: chains,
      showQrModal: true,
      metadata: {
        name: 'pay.pxbt.app',
        description: 'Страница для приёма переводов',
        url: location.origin,
        icons: [location.origin + '/favicon.svg'],
      },
    });
    await provider.connect();
    return provider;
  },
};
