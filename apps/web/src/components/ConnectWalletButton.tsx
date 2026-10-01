import { useWallet } from '../midnight/useWallet';
import { ONE_AM_CHROME_STORE, ONE_AM_WEBSITE } from '../midnight/wallet';
import { ErrorNote, Note, Spinner, primaryButton, secondaryButton } from './ui';

/** Connect / disconnect 1AM. This template talks to 1AM only. */
export function ConnectWalletButton({ compact = false }: { compact?: boolean }) {
  const { state, connect, disconnect, rescan } = useWallet();
  const cls = compact ? `${primaryButton} px-3 py-1.5` : primaryButton;

  switch (state.status) {
    case 'detecting':
      return (
        <button type="button" disabled className={cls}>
          <Spinner dark /> Detecting 1AM…
        </button>
      );

    case 'no-wallet':
      return (
        <div className="flex flex-col gap-3">
          <a href={ONE_AM_CHROME_STORE} target="_blank" rel="noreferrer" className={cls}>
            Install 1AM Wallet
          </a>
          {!compact && (
            <p className="text-xs text-slate-400">
              1AM is not detected. Install it from{' '}
              <a href={ONE_AM_WEBSITE} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">
                1am.xyz
              </a>
              , refresh this page, then{' '}
              <button type="button" onClick={rescan} className="underline hover:text-slate-200">
                scan again
              </button>
              .
            </p>
          )}
        </div>
      );

    case 'connecting':
      return (
        <button type="button" disabled className={cls}>
          <Spinner dark /> Connecting to 1AM…
        </button>
      );

    case 'connected':
      return (
        <button type="button" onClick={disconnect} className={compact ? `${secondaryButton} px-3 py-1.5` : secondaryButton}>
          Disconnect
        </button>
      );

    case 'disconnected':
    case 'error':
      return (
        <div className="flex flex-col gap-3">
          {state.status === 'error' && <ErrorNote>{state.message}</ErrorNote>}
          {state.status === 'disconnected' && state.notice && <Note>{state.notice}</Note>}
          <button type="button" onClick={() => void connect()} className={cls}>
            {state.wallet.api.icon && <img src={state.wallet.api.icon} alt="" className="size-5 rounded" />}
            Connect 1AM
          </button>
        </div>
      );
  }
}
