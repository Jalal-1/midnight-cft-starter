import { useState, type FormEvent } from 'react';
import { useCft } from '../midnight/useCft';
import { ErrorNote, Field, Mono, Panel, Spinner, Term, ghostButton, inputClass, primaryButton, secondaryButton } from './ui';

type Mode = 'list' | 'deploy' | 'join';

/** Every token this browser deployed or joined on the selected network, plus deploy / join. */
export function TokensPanel() {
  const { status, tokens, selectedAddress, accountId, deploy, join, select, forget } = useCft();
  const [mode, setMode] = useState<Mode>('list');
  const [name, setName] = useState('Starter Token');
  const [symbol, setSymbol] = useState('STK');
  const [decimals, setDecimals] = useState('2');
  const [address, setAddress] = useState('');
  const attaching = status.kind === 'attaching';

  const onDeploy = (e: FormEvent) => {
    e.preventDefault();
    const d = Number(decimals);
    if (!name.trim() || !symbol.trim() || !Number.isInteger(d) || d < 0 || d > 18) return;
    setMode('list');
    void deploy({ name: name.trim(), symbol: symbol.trim(), decimals: d });
  };
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setMode('list');
    void join(address.trim());
    setAddress('');
  };

  return (
    <Panel
      title={<>Your tokens <span className="ml-1 rounded-full bg-night-700 px-1.5 text-[10px] text-slate-300">{tokens.length}</span></>}
      aside={
        <div className="flex gap-1">
          <button type="button" onClick={() => setMode(mode === 'deploy' ? 'list' : 'deploy')} className={`${ghostButton} ${mode === 'deploy' ? 'bg-night-700 text-slate-100' : ''}`} disabled={attaching}>
            + Deploy
          </button>
          <button type="button" onClick={() => setMode(mode === 'join' ? 'list' : 'join')} className={`${ghostButton} ${mode === 'join' ? 'bg-night-700 text-slate-100' : ''}`} disabled={attaching}>
            Join
          </button>
        </div>
      }
    >
      {mode === 'deploy' && (
        <form onSubmit={onDeploy} className="mb-4 flex flex-col gap-3 rounded-xl border border-night-700 bg-night-800/60 p-3">
          <p className="text-xs text-slate-400">
            Deploys a new ConfidentialFungibleToken. You become the <Term id="issuer" />, the only account that can issue. Paid by your wallet.
          </p>
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol">
              <input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} required maxLength={12} />
            </Field>
            <Field label="Decimals">
              <input className={inputClass} type="number" min={0} max={18} value={decimals} onChange={(e) => setDecimals(e.target.value)} required />
            </Field>
          </div>
          <button type="submit" className={primaryButton}>
            Deploy with 1AM
          </button>
        </form>
      )}

      {mode === 'join' && (
        <form onSubmit={onJoin} className="mb-4 flex flex-col gap-3 rounded-xl border border-night-700 bg-night-800/60 p-3">
          <Field label={<Term id="contractAddress" />} hint="Printed by the deploy (CLI or another browser).">
            <input className={`${inputClass} font-mono`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="hex contract address" required />
          </Field>
          <button type="submit" className={secondaryButton}>
            Join token
          </button>
        </form>
      )}

      {status.kind === 'detached' && status.error && <div className="mb-3"><ErrorNote>{status.error}</ErrorNote></div>}

      {tokens.length === 0 && !attaching ? (
        <p className="text-sm text-slate-500">
          No tokens on this network yet. Deploy one, or join a token someone shared with you.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attaching && status.what === 'deploy' && (
            <li className="flex items-center gap-3 rounded-xl border border-glow-400/40 bg-glow-400/10 p-3 text-sm text-slate-200">
              <Spinner /> Deploying… approve the transaction in 1AM. Proving can take a minute the first time.
            </li>
          )}
          {tokens.map((t) => {
            const selected = t.address === selectedAddress;
            const isIssuer = (status.kind === 'attached' && selected && status.isIssuer) || (!!accountId && t.deployedBy === accountId);
            return (
              <li key={t.address}>
                <div
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${selected ? 'border-glow-400/60 bg-glow-400/10' : 'border-night-700 bg-night-800/40 hover:border-night-600'}`}
                >
                  <button type="button" onClick={() => void select(t.address)} disabled={attaching} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-50">{t.name}</span>
                      <span className="text-xs text-slate-400">{t.symbol}</span>
                      {isIssuer && (
                        <span className="rounded-full border border-glow-400/40 bg-glow-400/10 px-1.5 text-[10px] font-medium text-glow-300">Issuer</span>
                      )}
                    </span>
                    <Mono value={t.address} />
                  </button>
                  {attaching && selected ? <Spinner /> : null}
                  <button type="button" onClick={() => forget(t.address)} className={ghostButton} title="Forget this token (does not affect the chain)" aria-label={`Forget ${t.name}`}>
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
