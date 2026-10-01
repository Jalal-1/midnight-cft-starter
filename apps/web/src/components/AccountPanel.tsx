import { useState, type FormEvent } from 'react';
import { formatAmount, parseAmount } from '@midnight-starter/contract';
import { useCft } from '../midnight/useCft';
import { Card, CopyButton, ErrorNote, Field, Mono, Row, Spinner, inputClass, primaryButton, secondaryButton } from './ui';

function AmountForm({
  title,
  cta,
  withRecipient,
  decimals,
  disabled,
  onSubmit,
}: {
  title: string;
  cta: string;
  withRecipient?: boolean;
  decimals: number;
  disabled?: boolean;
  onSubmit: (to: string | undefined, amount: bigint) => Promise<unknown>;
}) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const units = parseAmount(amount, decimals);
      if (units <= 0n) throw new Error('amount must be positive');
      await onSubmit(withRecipient ? to.trim() : undefined, units);
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-900/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {withRecipient && (
        <input
          className={`${inputClass} font-mono`}
          placeholder="recipient accountId (64 hex)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          disabled={disabled}
        />
      )}
      <div className="flex gap-2">
        <input className={inputClass} placeholder={`amount (${decimals} decimals)`} value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={disabled} />
        <button type="submit" className={secondaryButton} disabled={disabled}>
          {cta}
        </button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </form>
  );
}

export function AccountPanel() {
  const { status, accountId, register, sweep, transfer, burn, mint, setKnownSpendable, lastReceipt } = useCft();
  const [showViewingKey, setShowViewingKey] = useState(false);
  const [known, setKnown] = useState('');

  if (status.kind !== 'attached' || !accountId) return null;
  const { token, client, balances, busy, isIssuer, error } = status;
  const d = token.decimals;
  const fmt = (v: bigint | undefined) => (v === undefined ? '?' : `${formatAmount(v, d)} ${token.symbol}`);

  return (
    <Card
      title="Your confidential account"
      aside={busy ? <span className="flex items-center gap-2 text-xs text-slate-300"><Spinner /> {busy}</span> : undefined}
    >
      <div className="divide-y divide-night-700">
        <Row label="Account id">
          <Mono value={accountId} />
          <CopyButton value={accountId} />
        </Row>
        <Row label="Viewing key">
          {showViewingKey ? (
            <>
              <Mono value={client.viewingKey} />
              <CopyButton value={client.viewingKey} />
            </>
          ) : (
            <button type="button" onClick={() => setShowViewingKey(true)} className="text-xs text-glow-300 underline hover:text-glow-400">
              Reveal
            </button>
          )}
        </Row>
        {balances?.registered ? (
          <>
            <Row label="Spendable">
              <span className="font-mono text-sm text-slate-100">{fmt(balances.spendable)}</span>
              <span className="text-xs text-slate-500">({balances.spendableSource})</span>
            </Row>
            <Row label="Pending">
              <span className="font-mono text-sm text-slate-100">{fmt(balances.pending)}</span>
              <span className="text-xs text-slate-500">({balances.pendingSource})</span>
            </Row>
            <Row label="Credits received">
              <span className="font-mono text-xs text-slate-300">
                {balances.memos.length === 0 ? 'none yet' : balances.memos.map((m) => formatAmount(m, d)).join(', ')}
              </span>
            </Row>
          </>
        ) : (
          <Row label="Status">
            <span className="text-sm text-slate-300">{balances ? 'Not registered' : 'Loading…'}</span>
          </Row>
        )}
      </div>

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {lastReceipt && (
        <p className="mt-3 text-xs text-slate-500">
          Last tx <span className="font-mono">{lastReceipt.txId.slice(0, 16)}…</span> in block {lastReceipt.blockHeight}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {balances && !balances.registered && (
          <div className="flex flex-col gap-2">
            <button type="button" className={primaryButton} disabled={!!busy} onClick={() => void register()}>
              Register this account
            </button>
            <p className="text-xs text-slate-500">
              Publishes your encryption key so others (or the issuer) can send you tokens. Permissionless, paid by your wallet.
            </p>
          </div>
        )}

        {balances?.registered && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={secondaryButton}
                disabled={!!busy || !balances.pending || balances.spendable === undefined}
                onClick={() => void sweep()}
              >
                Sweep pending into spendable
              </button>
            </div>

            {balances.spendable === undefined && (
              <form
                className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void setKnownSpendable(parseAmount(known, d));
                }}
              >
                <p className="text-xs text-amber-200">
                  This browser cannot derive your spendable balance (no record of it and above the recovery bound). Enter the
                  balance you know; it is verified against the on-chain ciphertext before use.
                </p>
                <div className="flex gap-2">
                  <input className={inputClass} value={known} onChange={(e) => setKnown(e.target.value)} placeholder="known spendable" />
                  <button type="submit" className={secondaryButton}>Verify</button>
                </div>
              </form>
            )}

            <AmountForm title="Send confidentially" cta="Send" withRecipient decimals={d} disabled={!!busy} onSubmit={(to, v) => transfer(to!, v)} />
            <AmountForm title="Burn" cta="Burn" decimals={d} disabled={!!busy} onSubmit={(_, v) => burn(v)} />
            {isIssuer && (
              <AmountForm title="Mint (issuer only)" cta="Mint" withRecipient decimals={d} disabled={!!busy} onSubmit={(to, v) => mint(to!, v)} />
            )}
          </>
        )}
      </div>

      <Field label="" hint="Amounts are hidden on chain; the (sender, recipient) pair and mint/burn supply deltas are public.">
        <span />
      </Field>
    </Card>
  );
}
