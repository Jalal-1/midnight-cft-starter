import { useState, type FormEvent } from 'react';
import { formatAmount, parseAmount } from '@midnight-starter/contract';
import { useCft } from '../midnight/useCft';
import { ErrorNote, Note, Panel, Spinner, Term, inputClass, primaryButton, secondaryButton } from './ui';
import type { GlossaryId } from '../midnight/glossary';

function AmountForm({
  term,
  cta,
  decimals,
  disabled,
  recipients,
  selfId,
  onSubmit,
  primary = false,
  description,
}: {
  term: GlossaryId;
  cta: string;
  decimals: number;
  disabled?: boolean;
  /** When set, the form asks for a recipient and offers these registered account ids. */
  recipients?: string[];
  selfId?: string;
  onSubmit: (to: string | undefined, amount: bigint) => Promise<unknown>;
  primary?: boolean;
  description: string;
}) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const others = (recipients ?? []).filter((a) => a !== selfId);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    try {
      const units = parseAmount(amount, decimals);
      if (units <= 0n) throw new Error('amount must be positive');
      if (recipients && !/^[0-9a-fA-F]{64}$/.test(to.trim())) throw new Error('recipient must be a 64-hex Account ID');
      await onSubmit(recipients ? to.trim().toLowerCase() : undefined, units);
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Term id={term} />
      </p>
      <p className="text-xs text-slate-500">{description}</p>
      {recipients && (
        <>
          {others.length > 0 && (
            <select
              className={inputClass}
              value={others.includes(to) ? to : ''}
              onChange={(e) => setTo(e.target.value)}
              disabled={disabled}
              aria-label="registered recipients"
            >
              <option value="">Pick a registered account…</option>
              {others.map((a) => (
                <option key={a} value={a}>
                  {a.slice(0, 12)}…{a.slice(-8)}
                </option>
              ))}
            </select>
          )}
          <input
            className={`${inputClass} font-mono`}
            placeholder="recipient Account ID (64 hex)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            disabled={disabled}
          />
        </>
      )}
      <div className="flex gap-2">
        <input className={inputClass} placeholder={`amount (${decimals} decimals)`} value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={disabled} />
        <button type="submit" className={primary ? primaryButton : secondaryButton} disabled={disabled}>
          {cta}
        </button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </form>
  );
}

export function ActionsPanel() {
  const { status, accountId, register, sweep, transfer, burn, mint, setKnownSpendable, lastReceipt } = useCft();
  const [known, setKnown] = useState('');

  if (status.kind !== 'attached') {
    return (
      <Panel title="Actions">
        <p className="text-sm text-slate-500">Actions appear once a token is selected.</p>
      </Panel>
    );
  }

  const { token, balances, busy, isIssuer, error } = status;
  const d = token.decimals;
  const disabled = !!busy;

  return (
    <Panel title="Actions" aside={busy ? <span className="flex items-center gap-2 text-xs text-slate-300"><Spinner /> {busy}</span> : undefined}>
      <div className="flex flex-col gap-3">
        {error && <ErrorNote>{error}</ErrorNote>}

        {balances && !balances.registered && (
          <div className="flex flex-col gap-2 rounded-xl border border-glow-400/40 bg-glow-400/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Term id="register" />
            </p>
            <p className="text-xs text-slate-300">
              Publishes your encryption key so this token can credit you. Required before anyone can issue or send to you.
            </p>
            <button type="button" className={primaryButton} disabled={disabled} onClick={() => void register()}>
              Register this account
            </button>
          </div>
        )}

        {balances?.registered && (
          <>
            {isIssuer && (
              <AmountForm
                term="issue"
                cta="Issue"
                primary
                decimals={d}
                disabled={disabled}
                recipients={token.accounts}
                selfId={accountId}
                description="Create new tokens for a registered account. The recipient registers first and gives you their Account ID; the amount becomes visible through the public total supply."
                onSubmit={(to, v) => mint(to!, v)}
              />
            )}

            <div className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Term id="sweep" />
              </p>
              <p className="text-xs text-slate-500">
                Pending: <span className="font-mono text-slate-300">{balances.pending === undefined ? '?' : `${formatAmount(balances.pending, d)} ${token.symbol}`}</span>. Move it into your spendable balance before sending or burning.
              </p>
              <button
                type="button"
                className={secondaryButton}
                disabled={disabled || !balances.pending || balances.spendable === undefined}
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
                  This browser cannot derive your <Term id="spendable">spendable balance</Term> (no record of it and above the recovery bound). Enter the balance you know; it is verified against the on-chain ciphertext before use.
                </p>
                <div className="flex gap-2">
                  <input className={inputClass} value={known} onChange={(e) => setKnown(e.target.value)} placeholder="known spendable" />
                  <button type="submit" className={secondaryButton}>Verify</button>
                </div>
              </form>
            )}

            <AmountForm
              term="send"
              cta="Send"
              decimals={d}
              disabled={disabled}
              recipients={token.accounts}
              selfId={accountId}
              description="Confidential transfer from your spendable balance. The amount stays hidden; your and the recipient's Account IDs are public."
              onSubmit={(to, v) => transfer(to!, v)}
            />
            <AmountForm
              term="burn"
              cta="Burn"
              decimals={d}
              disabled={disabled}
              description="Destroy tokens from your spendable balance. The public total supply drops by the same amount."
              onSubmit={(_, v) => burn(v)}
            />
          </>
        )}

        {lastReceipt && (
          <Note>
            Last transaction <span className="font-mono">{lastReceipt.txId.slice(0, 18)}…</span> confirmed in block {lastReceipt.blockHeight}.
          </Note>
        )}
      </div>
    </Panel>
  );
}
