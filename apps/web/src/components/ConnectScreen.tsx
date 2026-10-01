import { ConnectWalletButton } from './ConnectWalletButton';
import { Note } from './ui';

/** Shown until 1AM is connected. */
export function ConnectScreen() {
  return (
    <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,theme(colors.glow.400/20%),transparent_60%)]"
      />
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <span className="rounded-full border border-night-600 bg-night-800 px-3 py-1 text-xs font-medium tracking-wide text-slate-400">
            Starter template
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-50">
            Build on <span className="text-glow-300">Midnight</span>
          </h1>
          <p className="mt-3 text-balance text-slate-400">
            Deploy and use an OpenZeppelin confidential token: balances and transfer amounts stay encrypted on chain.
            Connect the 1AM wallet to begin.
          </p>
        </div>
        <section className="flex flex-col gap-4 rounded-2xl border border-night-700 bg-night-900/60 p-6 backdrop-blur">
          <ConnectWalletButton />
          <Note>
            The app uses whichever network 1AM is on (Preview, Preprod, Mainnet or a local devnet) and follows the wallet
            if you switch. Your tokens and account are remembered per network in this browser.
          </Note>
        </section>
        <nav className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <a href="https://docs.midnight.network" target="_blank" rel="noreferrer" className="hover:text-slate-200">Midnight docs</a>
          <a href="https://1am.xyz" target="_blank" rel="noreferrer" className="hover:text-slate-200">1AM wallet</a>
          <a href="https://github.com/OpenZeppelin/compact-contracts" target="_blank" rel="noreferrer" className="hover:text-slate-200">OpenZeppelin Compact</a>
        </nav>
      </div>
    </main>
  );
}
