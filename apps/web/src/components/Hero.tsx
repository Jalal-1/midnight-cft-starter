export function Hero() {
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <span className="rounded-full border border-night-600 bg-night-800 px-3 py-1 text-xs font-medium tracking-wide text-slate-400">
        Starter template
      </span>
      <h1 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
        Build on <span className="text-glow-300">Midnight</span>
      </h1>
      <p className="max-w-xl text-balance text-slate-400">
        A forkable starting point for privacy-preserving dApps. Connect a wallet, then add your
        Compact contract and deploy flow.
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-4 text-sm">
        <a
          href="https://docs.midnight.network"
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
        >
          Midnight docs
        </a>
        <a
          href="https://1am.xyz"
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
        >
          1AM wallet
        </a>
        <a
          href="https://docs.midnight.network/api-reference/dapp-connector"
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline-offset-4 hover:text-slate-50 hover:underline"
        >
          DApp Connector API
        </a>
      </nav>
    </header>
  );
}
