import { formatAmount } from '@midnight-starter/contract';
import { useCft } from '../midnight/useCft';
import { CopyButton, ErrorNote, Mono, Panel, Row, Term, ghostButton } from './ui';

export function TokenDetails() {
  const { status, refresh, detach } = useCft();

  if (status.kind !== 'attached') {
    return (
      <Panel title="Token" className="flex-none">
        <p className="text-sm text-slate-500">
          {status.kind === 'attaching'
            ? 'Loading token…'
            : 'Select a token on the left, deploy a new one, or join one by address.'}
        </p>
      </Panel>
    );
  }

  const { token, client, isIssuer, error } = status;
  return (
    <Panel
      title="Token"
      className="flex-none"
      aside={
        <div className="flex items-center gap-1">
          {isIssuer && (
            <span className="rounded-full border border-glow-400/40 bg-glow-400/10 px-2 py-0.5 text-[10px] font-medium text-glow-300">You are the issuer</span>
          )}
          <button type="button" onClick={() => void refresh()} className={ghostButton}>Refresh</button>
          <button type="button" onClick={detach} className={ghostButton}>Close</button>
        </div>
      }
    >
      <p className="text-2xl font-bold text-slate-50">
        {token.name} <span className="text-base font-medium text-slate-400">{token.symbol}</span>
      </p>
      <p className="mb-2 text-xs text-slate-500">OpenZeppelin ConfidentialFungibleToken · {token.decimals} decimals</p>
      <div className="divide-y divide-night-700">
        <Row label={<Term id="contractAddress" />}>
          <Mono value={client.address} />
          <CopyButton value={client.address} />
        </Row>
        <Row label={<Term id="totalSupply" />}>
          <span className="font-mono text-sm text-slate-100">{formatAmount(token.totalSupply, token.decimals)} {token.symbol}</span>
        </Row>
        <Row label={<Term id="issuer" />}>
          <Mono value={token.issuerAccountId} />
          {isIssuer && <span className="text-xs text-glow-300">(you)</span>}
        </Row>
        <Row label={<Term id="registeredAccounts" />}>
          <span className="font-mono text-sm text-slate-100">{token.accounts.length}</span>
        </Row>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Panel>
  );
}
