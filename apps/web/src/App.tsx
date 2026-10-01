import { useState } from 'react';
import { AccountCard } from './components/AccountCard';
import { ActionsPanel } from './components/ActionsPanel';
import { ConnectScreen } from './components/ConnectScreen';
import { Glossary } from './components/Glossary';
import { Header } from './components/Header';
import { TokenDetails } from './components/TokenDetails';
import { TokensPanel } from './components/TokensPanel';
import { CftProvider } from './midnight/CftProvider';
import { useWallet } from './midnight/useWallet';
import { WalletProvider } from './midnight/WalletProvider';

function Dashboard() {
  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12 lg:overflow-hidden">
      <div className="flex min-h-0 flex-col lg:col-span-3">
        <TokensPanel />
      </div>
      <div className="flex min-h-0 flex-col gap-4 lg:col-span-5">
        <TokenDetails />
        <AccountCard />
      </div>
      <div className="flex min-h-0 flex-col lg:col-span-4">
        <ActionsPanel />
      </div>
    </main>
  );
}

function Shell() {
  const { state } = useWallet();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header onGlossary={() => setGlossaryOpen(true)} />
      {state.status === 'connected' ? <Dashboard /> : <ConnectScreen />}
      {glossaryOpen && <Glossary onClose={() => setGlossaryOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <CftProvider>
        <Shell />
      </CftProvider>
    </WalletProvider>
  );
}
