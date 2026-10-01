import { useWallet } from '../midnight/useWallet';
import { ONE_AM_CHROME_STORE, ONE_AM_WEBSITE, is1am } from '../midnight/wallet';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-glow-400/40 disabled:cursor-not-allowed disabled:opacity-60';
const primary = `${base} bg-glow-400 text-night-950 hover:bg-glow-300`;
const secondary = `${base} border border-night-600 bg-night-800 text-slate-100 hover:border-glow-400`;

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-night-950/30 border-t-night-950"
    />
  );
}

export function ConnectWalletButton() {
  const { state, connect, disconnect, rescanWallets, preferredWallet, lastWalletKey } = useWallet();

  switch (state.status) {
    case 'detecting':
      return (
        <button type="button" disabled className={primary}>
          <Spinner /> Detecting wallet…
        </button>
      );

    case 'no-wallet':
      return (
        <div className="flex flex-col gap-3">
          <a href={ONE_AM_CHROME_STORE} target="_blank" rel="noreferrer" className={primary}>
            Install 1AM Wallet
          </a>
          <p className="text-xs text-slate-400">
            No Midnight wallet detected. Install{' '}
            <a href={ONE_AM_WEBSITE} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">
              1AM
            </a>
            , refresh this page, then{' '}
            <button type="button" onClick={rescanWallets} className="underline hover:text-slate-200">
              scan again
            </button>
            .
          </p>
        </div>
      );

    case 'connecting':
      return (
        <button type="button" disabled className={primary}>
          <Spinner /> Connecting to {state.wallet.api.name}…
        </button>
      );

    case 'connected':
      return (
        <button type="button" onClick={disconnect} className={secondary}>
          Disconnect
        </button>
      );

    case 'disconnected':
    case 'error': {
      const wallets = state.wallets;
      const others = wallets.filter((w) => !is1am(w));
      const reconnect = lastWalletKey ? wallets.find((w) => w.key === lastWalletKey) : undefined;

      return (
        <div className="flex flex-col gap-3">
          {state.status === 'error' && (
            <p
              role="alert"
              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
            >
              {state.message}
            </p>
          )}
          {state.status === 'disconnected' && state.notice && (
            <p className="rounded-md border border-night-600 bg-night-800 px-3 py-2 text-sm text-slate-300">
              {state.notice}
            </p>
          )}

          {preferredWallet ? (
            <button type="button" onClick={() => void connect(preferredWallet.key)} className={primary}>
              <WalletIcon src={preferredWallet.api.icon} />
              {reconnect && is1am(reconnect) ? 'Reconnect 1AM' : 'Connect 1AM'}
            </button>
          ) : (
            <p className="text-xs text-slate-400">
              1AM not detected.{' '}
              <a href={ONE_AM_CHROME_STORE} target="_blank" rel="noreferrer" className="underline">
                Install it
              </a>{' '}
              or pick another wallet below.
            </p>
          )}

          {others.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wider text-slate-500">Other wallets</p>
              {others.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => void connect(w.key)}
                  className={secondary}
                >
                  <WalletIcon src={w.api.icon} />
                  Connect {w.api.name}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
  }
}

function WalletIcon({ src }: { src: string }) {
  if (!src) return null;
  // Spec: render wallet icons via <img>, never inline, to avoid XSS from untrusted data.
  return <img src={src} alt="" className="size-5 rounded" />;
}
