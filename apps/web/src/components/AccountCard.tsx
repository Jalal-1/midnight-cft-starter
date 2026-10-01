import { useState } from 'react';
import { formatAmount } from '@midnight-starter/contract';
import { useCft } from '../midnight/useCft';
import { CopyButton, Mono, Panel, Row, Term, ghostButton } from './ui';

/** This wallet's confidential account on the attached token. */
export function AccountCard() {
  const { status, accountId } = useCft();
  const [showViewingKey, setShowViewingKey] = useState(false);

  if (!accountId) return null;
  const attached = status.kind === 'attached' ? status : undefined;
  const token = attached?.token;
  const balances = attached?.balances;
  const fmt = (v: bigint | undefined) => (!token ? '' : v === undefined ? '?' : `${formatAmount(v, token.decimals)} ${token.symbol}`);

  return (
    <Panel title="Your account">
      <div className="divide-y divide-night-700">
        <Row label={<Term id="accountId" />}>
          <Mono value={accountId} />
          <CopyButton value={accountId} />
        </Row>
        <Row label={<Term id="viewingKey" />}>
          {attached ? (
            showViewingKey ? (
              <>
                <Mono value={attached.client.viewingKey} />
                <CopyButton value={attached.client.viewingKey} />
              </>
            ) : (
              <button type="button" onClick={() => setShowViewingKey(true)} className={ghostButton}>Reveal</button>
            )
          ) : (
            <span className="text-xs text-slate-500">select a token</span>
          )}
        </Row>
        {attached && (
          <Row label="Status">
            <span className={`text-sm ${balances?.registered ? 'text-emerald-300' : 'text-slate-300'}`}>
              {!balances ? 'Loading…' : balances.registered ? 'Registered' : 'Not registered'}
            </span>
          </Row>
        )}
        {balances?.registered && token && (
          <>
            <Row label={<Term id="spendable" />}>
              <span className="font-mono text-sm text-slate-100">{fmt(balances.spendable)}</span>
              <Term id="balanceSource" align="right">
                <span className="text-xs text-slate-500">{balances.spendableSource}</span>
              </Term>
            </Row>
            <Row label={<Term id="pending" />}>
              <span className="font-mono text-sm text-slate-100">{fmt(balances.pending)}</span>
              <Term id="balanceSource" align="right">
                <span className="text-xs text-slate-500">{balances.pendingSource}</span>
              </Term>
            </Row>
            <Row label={<Term id="memos" />}>
              <span className="font-mono text-xs text-slate-300">
                {balances.memos.length === 0 ? 'none yet' : balances.memos.map((m) => formatAmount(m, token.decimals)).join(', ')}
              </span>
            </Row>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Your Account ID is the same on every token of this network; share it with whoever should send or issue to you.
      </p>
    </Panel>
  );
}
