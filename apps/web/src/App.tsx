import { ConnectWalletButton } from './components/ConnectWalletButton';
import { Hero } from './components/Hero';
import { NetworkSelect } from './components/NetworkSelect';
import { WalletCard } from './components/WalletCard';
import { WalletProvider } from './midnight/WalletProvider';

export default function App() {
  return (
    <WalletProvider>
      <main className="relative flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,theme(colors.glow.400/20%),transparent_60%)]"
        />
        <Hero />

        <section className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-night-700 bg-night-900/60 p-6 backdrop-blur">
          <NetworkSelect />
          <ConnectWalletButton />
        </section>

        <div className="w-full max-w-md">
          <WalletCard />
        </div>

        <footer className="text-xs text-slate-600">
          Midnight Starter · Apache-2.0 · DApp Connector v4
        </footer>
      </main>
    </WalletProvider>
  );
}
