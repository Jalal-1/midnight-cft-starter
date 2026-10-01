import { nativeToken } from '@midnight-ntwrk/ledger-v8';
import { NETWORKS } from '../midnight/networks';
import { useWallet } from '../midnight/useWallet';
import { formatUnits, truncateAddress } from '../midnight/wallet';
import { ConnectWalletButton } from './ConnectWalletButton';
import { CopyButton, Term, ghostButton } from './ui';

export function Header({ onGlossary }: { onGlossary: () => void }) {
  const { state } = useWallet();
  const connected = state.status === 'connected' ? state : undefined;
  const night = connected?.balances ? (connected.balances.unshielded[nativeToken().raw] ?? 0n) : undefined;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-night-700 bg-night-900/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-block size-6 rounded-lg bg-[radial-gradient(circle_at_30%_30%,theme(colors.glow.300),theme(colors.glow.400)_60%,theme(colors.night.800)_61%)]" />
        <span className="text-sm font-semibold tracking-tight text-slate-50">Midnight Starter</span>
        <span className="hidden rounded-full border border-night-600 px-2 py-0.5 text-[11px] text-slate-400 sm:inline">
          OpenZeppelin Confidential Fungible Token
        </span>
      </div>

      <div className="flex items-center gap-3">
        {connected && (
          <span
            className="flex items-center gap-1.5 rounded-full border border-glow-400/40 bg-glow-400/10 px-2.5 py-1 text-xs font-medium text-glow-300"
            title={NETWORKS[connected.networkId].caution ?? NETWORKS[connected.networkId].description}
          >
            <Term id="network" align="right">
              {NETWORKS[connected.networkId].label}
            </Term>
            {NETWORKS[connected.networkId].caution && <span aria-label="caution" className="size-2 rounded-full bg-amber-400" />}
          </span>
        )}
        {connected && (
          <div className="hidden items-center gap-2 rounded-lg border border-night-600 bg-night-800 px-2.5 py-1.5 text-xs md:flex">
            {connected.wallet.api.icon && <img src={connected.wallet.api.icon} alt="" className="size-4 rounded" />}
            <span className="font-mono text-slate-100" title={connected.address}>
              {truncateAddress(connected.address, 14, 6)}
            </span>
            <CopyButton value={connected.address} />
            <span className="text-slate-500">·</span>
            <span className="font-mono text-slate-300" title="NIGHT">
              {night === undefined ? '—' : formatUnits(night)} NIGHT
            </span>
            <span className="font-mono text-slate-500" title="DUST (spendable / cap)">
              {connected.balances ? `${formatUnits(connected.balances.dust.balance)} / ${formatUnits(connected.balances.dust.cap)}` : '—'} DUST
            </span>
          </div>
        )}
        {connected && <ConnectWalletButton compact />}
        <button type="button" onClick={onGlossary} className={`${ghostButton} border border-night-600`} title="What do these fields mean?">
          Glossary
        </button>
      </div>
    </header>
  );
}
