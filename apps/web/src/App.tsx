import { AccountPanel } from './components/AccountPanel';
import { ConnectWalletButton } from './components/ConnectWalletButton';
import { ContractPanel } from './components/ContractPanel';
import { Hero } from './components/Hero';
import { NetworkSelect } from './components/NetworkSelect';
import { WalletCard } from './components/WalletCard';
import { CftProvider } from './midnight/CftProvider';
import { WalletProvider } from './midnight/WalletProvider';

export default function App() {
  return (
    <WalletProvider>
      <CftProvider>
        <main className="relative flex min-h-dvh flex-col items-center gap-8 px-4 py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,theme(colors.glow.400/20%),transparent_60%)]"
          />
          <Hero />

          <section className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-night-700 bg-night-900/60 p-6 backdrop-blur">
            <NetworkSelect />
            <ConnectWalletButton />
          </section>

          <div className="flex w-full max-w-2xl flex-col gap-6">
            <WalletCard />
            <ContractPanel />
            <AccountPanel />
          </div>

          <footer className="text-xs text-slate-600">Midnight Starter · Apache-2.0 · DApp Connector v4 · OpenZeppelin CFT</footer>
        </main>
      </CftProvider>
    </WalletProvider>
  );
}
