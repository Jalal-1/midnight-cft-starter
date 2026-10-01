import { useState } from 'react';
import { NETWORKS } from '../midnight/networks';
import { useWallet } from '../midnight/useWallet';
import { formatUnits, truncateAddress } from '../midnight/wallet';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-night-700 hover:text-slate-100"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <div className="min-w-0 text-right text-sm text-slate-100">{children}</div>
    </div>
  );
}

export function WalletCard() {
  const { state, refreshBalances } = useWallet();
  const [refreshing, setRefreshing] = useState(false);
  const [showShielded, setShowShielded] = useState(false);
  if (state.status !== 'connected') return null;

  const { wallet, networkId, address, shieldedAddress, balances, balancesError } = state;
  const unshieldedEntries = balances ? Object.entries(balances.unshielded) : [];
  // TODO(phase 2): once @midnight-ntwrk/ledger-v8 is added, identify NIGHT via nativeToken()
  // instead of assuming the first unshielded token type is NIGHT.
  const night = unshieldedEntries[0]?.[1];

  return (
    <section className="w-full rounded-2xl border border-night-600 bg-night-900/80 p-5 shadow-xl shadow-black/30 backdrop-blur">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {wallet.api.icon && <img src={wallet.api.icon} alt="" className="size-8 rounded-lg" />}
          <div>
            {/* Wallet name is untrusted; rendering as a text node keeps it safe. */}
            <p className="text-sm font-semibold text-slate-100">{wallet.api.name}</p>
            <p className="text-xs text-slate-500">Connector v{wallet.api.apiVersion}</p>
          </div>
        </div>
        <span className="rounded-full border border-glow-400/40 bg-glow-400/10 px-3 py-1 text-xs font-medium text-glow-300">
          {NETWORKS[networkId].label}
        </span>
      </header>

      <div className="divide-y divide-night-700">
        <Row label="Address">
          <span className="font-mono" title={address}>
            {truncateAddress(address)}
          </span>
          <CopyButton value={address} />
        </Row>

        <Row label="Shielded">
          {showShielded ? (
            <>
              <span className="font-mono" title={shieldedAddress}>
                {truncateAddress(shieldedAddress)}
              </span>
              <CopyButton value={shieldedAddress} />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowShielded(true)}
              className="text-xs text-glow-300 underline hover:text-glow-400"
            >
              Reveal
            </button>
          )}
        </Row>

        <Row label="NIGHT">
          {balances ? (
            <span className="font-mono">{night === undefined ? '0' : formatUnits(night)}</span>
          ) : balancesError ? (
            <span className="text-xs text-rose-300">unavailable</span>
          ) : (
            <span className="text-xs text-slate-500">loading…</span>
          )}
        </Row>

        <Row label="DUST">
          {balances ? (
            <span className="font-mono">
              {formatUnits(balances.dust.balance)}
              <span className="text-slate-500"> / {formatUnits(balances.dust.cap)}</span>
            </span>
          ) : balancesError ? (
            <span className="text-xs text-rose-300">unavailable</span>
          ) : (
            <span className="text-xs text-slate-500">loading…</span>
          )}
        </Row>
      </div>

      {balancesError && <p className="mt-3 text-xs text-rose-300">{balancesError}</p>}

      <footer className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await refreshBalances();
            setRefreshing(false);
          }}
          className="text-xs text-slate-400 hover:text-slate-100 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh balances'}
        </button>
      </footer>
    </section>
  );
}
