import { useState, type FormEvent } from 'react';
import { formatAmount } from '@midnight-starter/contract';
import { useCft } from '../midnight/useCft';
import { Card, CopyButton, ErrorNote, Field, Mono, Row, Spinner, inputClass, primaryButton, secondaryButton } from './ui';

export function ContractPanel() {
  const { status, deploy, join, detach, refresh } = useCft();
  const [name, setName] = useState('Starter Token');
  const [symbol, setSymbol] = useState('STK');
  const [decimals, setDecimals] = useState('2');
  const [address, setAddress] = useState('');

  if (status.kind === 'no-wallet') return null;

  if (status.kind === 'attaching') {
    return (
      <Card title={status.what === 'deploy' ? 'Deploying token' : 'Joining token'}>
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Spinner />
          {status.what === 'deploy'
            ? 'Building the deploy transaction. Your wallet will ask you to approve it; proving can take a minute the first time.'
            : 'Reading the contract from the indexer…'}
        </div>
      </Card>
    );
  }

  if (status.kind === 'attached') {
    const { token, client, isIssuer } = status;
    return (
      <Card
        title="Token"
        aside={
          <div className="flex items-center gap-2">
            {isIssuer && (
              <span className="rounded-full border border-glow-400/40 bg-glow-400/10 px-2.5 py-0.5 text-xs font-medium text-glow-300">
                You are the issuer
              </span>
            )}
            <button type="button" onClick={() => void refresh()} className="text-xs text-slate-400 hover:text-slate-100">
              Refresh
            </button>
            <button type="button" onClick={detach} className="text-xs text-slate-400 hover:text-slate-100">
              Leave
            </button>
          </div>
        }
      >
        <div className="mb-3">
          <p className="text-2xl font-bold text-slate-50">
            {token.name} <span className="text-base font-medium text-slate-400">{token.symbol}</span>
          </p>
          <p className="text-xs text-slate-500">OpenZeppelin ConfidentialFungibleToken · {token.decimals} decimals</p>
        </div>
        <div className="divide-y divide-night-700">
          <Row label="Contract">
            <Mono value={client.address} />
            <CopyButton value={client.address} />
          </Row>
          <Row label="Total supply">
            <span className="font-mono text-sm text-slate-100">
              {formatAmount(token.totalSupply, token.decimals)} {token.symbol}
            </span>
          </Row>
          <Row label="Issuer">
            <Mono value={token.issuerAccountId} />
          </Row>
          <Row label="Registered accounts">
            <span className="font-mono text-sm text-slate-100">{token.accounts.length}</span>
          </Row>
        </div>
        {status.error && <div className="mt-3"><ErrorNote>{status.error}</ErrorNote></div>}
      </Card>
    );
  }

  // detached
  const onDeploy = (e: FormEvent) => {
    e.preventDefault();
    const d = Number(decimals);
    if (!name.trim() || !symbol.trim() || !Number.isInteger(d) || d < 0 || d > 18) return;
    void deploy({ name: name.trim(), symbol: symbol.trim(), decimals: d });
  };
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (address.trim()) void join(address.trim());
  };

  return (
    <div className="grid w-full gap-4 sm:grid-cols-2">
      <Card title="Deploy a new token">
        <form onSubmit={onDeploy} className="flex flex-col gap-3">
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
            Deploy with wallet
          </button>
          <p className="text-xs text-slate-500">
            You become the issuer: the only account that can mint. The deploy is paid by your wallet (DUST).
          </p>
        </form>
      </Card>
      <Card title="Join an existing token">
        <form onSubmit={onJoin} className="flex flex-col gap-3">
          <Field label="Contract address" hint="Hex address printed by the deploy (CLI or another browser).">
            <input className={`${inputClass} font-mono`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0200…" required />
          </Field>
          <button type="submit" className={secondaryButton}>
            Join
          </button>
        </form>
        {status.error && <div className="mt-3"><ErrorNote>{status.error}</ErrorNote></div>}
      </Card>
    </div>
  );
}
