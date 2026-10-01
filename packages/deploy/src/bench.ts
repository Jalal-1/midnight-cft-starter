// Per-block concurrency benchmark for the CFT.
//
// Question: how many balance updates can land in ONE block? Method: deploy a
// fresh token, give every sending user its own funded fee wallet, build, prove
// and balance N transfers against the same chain state, submit them all in the
// same instant, then read back from the indexer which block included each one
// and whether it succeeded.
//
//   pnpm bench -- --mode disjoint --senders 10    N users → N other users, independently
//   pnpm bench -- --mode fanin    --senders 4     N users → the SAME recipient
//   pnpm bench -- --mode fanout   --senders 4     ONE user → N recipients, N separate transactions at once
//   pnpm bench -- --mode batch    --senders 10    ONE user (treasury) → N recipients in ONE transaction
//
// Three things bound the answer, and the benchmark separates them:
//   1. Fees (DUST). Every transaction pays its fee in DUST, and a wallet's DUST
//      is held as one coin per registered NIGHT UTXO. A coin is spent and
//      re-created per transaction, so a wallet with one coin pays for one
//      transaction per block. Independent users have independent wallets; the
//      fan-out sender is funded with N NIGHT UTXOs so it holds N DUST coins.
//   2. Execution-cost budget. A transaction declares the cost of replaying its
//      transcript, measured against the state it was built on (the DUST fee
//      covers that budget). When another transaction in the same block has
//      grown the same ledger map first, replaying costs more than declared and
//      the node rejects it at pre-dispatch; the node's internal name for this
//      is Transcript(Execution(OutOfGas)).
//   3. Contract state. Two credits to the SAME recipient in one block conflict
//      (see the "Concurrency" note in OpenZeppelin's ConfidentialFungibleToken
//      module), and two debits from the SAME sender both pin the sender's
//      balance ciphertext, so only the first can succeed. Transfers between
//      DISJOINT pairs touch different cells and commute.
//
// Operational note: the local indexer (4.3.5) crash-loops when a dozen wallets
// sync concurrently, so at most two wallets are live at any time: the funder
// and the one sender currently building / balancing. Finalized transactions
// are relayed through the funder's node connection.
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { createUnprovenCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import type { FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';
import type { FinalizedTransaction } from '@midnight-ntwrk/ledger-v8';
import {
  CftClient,
  CftPrivateState,
  PRIVATE_STATE_ID,
  deployCft,
  formatAmount,
  fromHex,
  joinCft,
  parseAmount,
} from '@midnight-starter/contract';
import { GENESIS_SEED, selectNetwork, type NetworkConfig } from './config.js';
import { arg, c, heading, log, ok, warn, withStatus } from './log.js';
import { compiledContract, makeProviders } from './providers.js';
import {
  ensureDust,
  nightBalance,
  randomSeedHex,
  sendNight,
  startWallet,
  stopWallet,
  waitForDustAtLeast,
  waitForNight,
  waitForSync,
  type HeadlessWallet,
} from './wallet.js';

const DECIMALS = 2;
type Mode = 'disjoint' | 'fanin' | 'fanout' | 'batch';

/** A CFT account plus (for senders) the seed of its own fee wallet. */
interface Account {
  name: string;
  identity: CftPrivateState;
  accountId: string;
  seed?: string;
  /** Unshielded address of the fee wallet (known after the first start). */
  address?: string;
}

const blockHeight = async (config: NetworkConfig): Promise<number> => {
  const res = await fetch(config.node, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'chain_getHeader', params: [] }),
  });
  const json = (await res.json()) as { result?: { number?: string } };
  return json.result?.number ? Number.parseInt(json.result.number, 16) : -1;
};

/** Deepest `cause` message of an error chain (the wallet SDK wraps node rejections several times). */
const rootCause = (e: unknown): string => {
  let cur: unknown = e;
  let msg = e instanceof Error ? e.message : String(e);
  for (let i = 0; i < 8 && cur instanceof Error && (cur as Error & { cause?: unknown }).cause; i++) {
    cur = (cur as Error & { cause?: unknown }).cause;
    if (cur instanceof Error && cur.message) msg = cur.message;
  }
  return msg;
};

const retry = async <T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      warn(`${label}: attempt ${i} failed (${rootCause(e)}); retrying next block`);
      await new Promise((r) => setTimeout(r, 7_000 + Math.random() * 3_000));
    }
  }
};

/** Local devnet only: summarise the node's pre-dispatch rejection reasons since `sinceMs`. */
const nodeRejectionReasons = async (networkName: string, sinceMs: number): Promise<string | undefined> => {
  if (networkName !== 'standalone') return undefined;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const since = new Date(sinceMs - 5_000).toISOString();
    const { stdout } = await promisify(execFile)('docker', ['compose', '-f', 'docker/standalone.yml', 'logs', 'node', '--since', since], {
      cwd: new URL('../../..', import.meta.url).pathname,
    });
    const counts = new Map<string, number>();
    for (const line of stdout.split('\n')) {
      const m = line.match(/Rejecting transaction [0-9a-f]+ at pre-dispatch: (.*)$/);
      if (m) counts.set(m[1]!.trim(), (counts.get(m[1]!.trim()) ?? 0) + 1);
    }
    return counts.size ? [...counts.entries()].map(([r, n]) => `${n}× ${r}`).join('; ') : 'none logged';
  } catch {
    return undefined;
  }
};

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: timed out after ${ms / 1000}s`)), ms))]);

const main = async () => {
  const networkName = arg('network', 'standalone')!;
  const config = selectNetwork(networkName);
  const seed = process.env.SEED ?? (networkName === 'standalone' ? GENESIS_SEED : undefined);
  if (!seed) throw new Error('SEED env var (hex) is required for public networks');
  const mode = arg('mode', 'disjoint') as Mode;
  if (!['disjoint', 'fanin', 'fanout', 'batch'].includes(mode)) throw new Error(`unknown --mode ${mode}`);
  /** Number of concurrent transfers (= senders, except fan-out: one sender, N recipients). */
  const N = Number(arg('senders', '4'));
  const amount = parseAmount(arg('amount', '1.00')!, DECIMALS);
  // NIGHT given to each sender's fee wallet (raw units, 6 decimals). DUST accrues
  // at ~8,267 specks per NIGHT unit per second, so 1M NIGHT covers a fee in ~1s.
  const nightEach = BigInt(arg('night-each', '1000000000000')!);
  const started = Date.now();
  const run = Date.now();

  heading(`CFT per-block concurrency benchmark · mode=${mode} · N=${N} · ${config.name}`);
  const funder = await withStatus('Starting funding wallet', () => startWallet(config, seed));
  await withStatus('Syncing', () => waitForSync(funder.wallet));
  if ((await nightBalance(funder.wallet)) === 0n) {
    warn(`No NIGHT. Fund ${funder.address} and wait...`);
    await withStatus('Waiting for NIGHT', () => waitForNight(funder.wallet));
  }
  await ensureDust(funder);
  const funderNight = await nightBalance(funder.wallet);
  log(`funder NIGHT: ${formatAmount(funderNight, 6)}`);
  if (funderNight < nightEach * BigInt(N) * 2n) {
    throw new Error(`funder holds ${formatAmount(funderNight, 6)} NIGHT; need ${formatAmount(nightEach * BigInt(N) * 2n, 6)} (lower --night-each or reset the devnet)`);
  }

  /** Providers for `account`, paying fees from `feeWallet`, private state scoped to the account itself. */
  const providersFor = (account: Account, feeWallet: HeadlessWallet) =>
    makeProviders(config, feeWallet, `bench-${run}-${account.name}`, account.address ?? account.accountId);
  const attach = async (account: Account, feeWallet: HeadlessWallet, address: string) => {
    const providers = await providersFor(account, feeWallet);
    const found = await joinCft(providers, compiledContract, address, account.identity);
    return { providers, client: await CftClient.attach(providers, found, account.identity, compiledContract) };
  };
  /** Run `fn` with the account's own fee wallet live, then stop it (keeps indexer load low). */
  const withOwnWallet = async <T>(account: Account, fn: (w: HeadlessWallet) => Promise<T>): Promise<T> => {
    const w = await startWallet(config, account.seed!);
    account.address = w.address;
    try {
      await waitForSync(w.wallet);
      return await fn(w);
    } finally {
      await stopWallet(w);
    }
  };
  const newAccount = (name: string, withWallet: boolean): Account => {
    const identity = CftPrivateState.generate();
    return { name, identity, accountId: CftPrivateState.accountIdHex(identity), seed: withWallet ? randomSeedHex() : undefined };
  };

  // ── Deploy (issuer = funder wallet) ──────────────────────────────────────
  heading('Deploy');
  const issuerAccount = newAccount('issuer', false);
  const issuerProviders = await makeProviders(config, funder, `bench-${run}-issuer`);
  const deployed = await withStatus('Deploying Bench Token (BNCH)', () =>
    deployCft(issuerProviders, compiledContract, issuerAccount.identity, { name: 'Bench Token', symbol: 'BNCH', decimals: DECIMALS }),
  );
  const address = deployed.deployTxData.public.contractAddress;
  const deployFee = BigInt(deployed.deployTxData.public.fees.paidFees);
  ok(`contract ${address} (deploy fee ${deployFee} specks)`);
  const issuer = new CftClient(issuerProviders, deployed, issuerAccount.identity, compiledContract);

  // ── Accounts and fee wallets ─────────────────────────────────────────────
  const senderCount = mode === 'fanout' || mode === 'batch' ? 1 : N;
  const recipientCount = mode === 'fanin' ? 1 : N;
  const senders = Array.from({ length: senderCount }, (_, i) => newAccount(`sender-${i}`, true));
  const recipients = Array.from({ length: recipientCount }, (_, i) => newAccount(`recipient-${i}`, false));
  /** Transfer j: which sender pays and which recipient is credited. */
  const pairs = Array.from({ length: N }, (_, j) => ({
    sender: senders[mode === 'fanout' || mode === 'batch' ? 0 : j]!,
    recipient: recipients[mode === 'fanin' ? 0 : j]!,
  }));
  // Fan-out: the single sender needs N DUST coins, i.e. N registered NIGHT UTXOs.
  const utxosPerSender = mode === 'fanout' ? N : 1;

  heading(`Fund ${senders.length} sender wallet(s) (${utxosPerSender} × ${formatAmount(nightEach, 6)} NIGHT each)`);
  for (const s of senders) {
    const w = await startWallet(config, s.seed!);
    s.address = w.address;
    await stopWallet(w);
  }
  await withStatus('Sending NIGHT', () =>
    sendNight(funder, senders.flatMap((s) => Array.from({ length: utxosPerSender }, () => ({ address: s.address!, amount: nightEach })))),
  );
  const reserve = deployFee * 2n;
  for (const s of senders) {
    await withStatus(`${s.name}: receive NIGHT, register ${utxosPerSender} UTXO(s) for DUST, reach ${reserve} specks`, () =>
      withOwnWallet(s, async (w) => {
        await waitForNight(w.wallet);
        await ensureDust(w);
        await waitForDustAtLeast(w.wallet, reserve * BigInt(utxosPerSender));
      }),
    );
  }

  // ── Setup: register everyone, fund the senders (one tx per block) ────────
  heading('Setup accounts (sequential: one transaction per block)');
  const setupStarted = Date.now();
  let setupTxs = 0;
  const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    const r = await retry(label, fn);
    log(`${label} ${c.gray}(${((Date.now() - t) / 1000).toFixed(1)}s)${c.reset}`);
    setupTxs++;
    return r;
  };
  const mintPerSender = amount * BigInt(mode === 'fanout' || mode === 'batch' ? N * 2 : 10);
  for (const s of senders) {
    await withOwnWallet(s, async (w) => {
      // Recipients have no wallet of their own; this sender's wallet pays for its recipients.
      const mine = pairs.filter((p) => p.sender === s).map((p) => p.recipient);
      for (const r of [...new Set(mine)]) {
        const { client } = await attach(r, w, address);
        const view = await client.view();
        if (!view.registered) await timed(`register ${r.name}`, () => client.register());
      }
      const { client } = await attach(s, w, address);
      await timed(`register ${s.name}`, () => client.register());
      await timed(`mint ${formatAmount(mintPerSender, DECIMALS)} → ${s.name}`, () => issuer.mint(s.accountId, mintPerSender));
      await timed(`sweep ${s.name}`, () => client.sweep());
    });
  }
  log(`setup: ${setupTxs} transactions in ${((Date.now() - setupStarted) / 1000).toFixed(0)}s`);

  if (mode === 'batch') {
    // ── Treasury batch: N chained transfers in ONE transaction ──────────────
    heading(`Batch: ${N} transfers from ${senders[0]!.name} in one transaction`);
    const s = senders[0]!;
    const stateHeight = await blockHeight(config);
    const result = await withOwnWallet(s, async (w) => {
      const { client } = await attach(s, w, address);
      const t0 = Date.now();
      const submitHeight = await blockHeight(config);
      try {
        const r = await client.transferBatch(recipients.map((rcp) => ({ to: rcp.accountId, value: amount })));
        return { ok: true as const, r, ms: Date.now() - t0, submitHeight };
      } catch (e) {
        return { ok: false as const, error: rootCause(e), ms: Date.now() - t0, submitHeight };
      }
    });
    heading('Results');
    if (result.ok) {
      const data = await issuerProviders.publicDataProvider.watchForTxData(result.r.txId);
      const segments = data.segmentStatusMap ? [...data.segmentStatusMap.entries()].map(([id, st]) => `${id}:${st}`).join(', ') : 'n/a';
      log(`one transaction ${result.r.txId.slice(0, 16)}… with ${N} transfer calls, built from block ${stateHeight}, included in block ${result.r.blockHeight} (+${result.r.blockHeight - result.submitHeight} after submit)`);
      log(`status ${data.status}; segments ${segments}; fee ${data.fees.paidFees} specks; build+prove+balance+confirm ${(result.ms / 1000).toFixed(1)}s`);
      ok(`${N} balance updates from one wallet in one block, one DUST fee`);
    } else {
      warn(`batch failed after ${(result.ms / 1000).toFixed(1)}s: ${result.error}`);
      const reasons = await nodeRejectionReasons(networkName, Date.now() - result.ms);
      if (reasons) log(`node pre-dispatch rejections: ${reasons}`);
    }
    heading('Ledger check');
    const token = await issuer.token();
    log(`totalSupply ${formatAmount(token.totalSupply, DECIMALS)} BNCH, registered ${token.accounts.length}`);
    let credited = 0;
    for (const r of recipients) {
      const { client } = await attach(r, funder, address);
      const b = await client.balances();
      if (b.pending === amount) credited++;
      log(`${r.name.padEnd(12)} pending=${formatAmount(b.pending ?? -1n, DECIMALS).padStart(8)} (${b.pendingSource}) credits=[${b.memos.map((m) => formatAmount(m, DECIMALS)).join(', ')}]`);
    }
    {
      const { client } = await attach(s, funder, address);
      const b = await client.balances();
      log(`${s.name.padEnd(12)} spendable=${formatAmount(b.spendable ?? -1n, DECIMALS).padStart(8)} (${b.spendableSource})`);
    }
    ok(`${credited}/${N} recipients credited; done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    process.exit(0);
  }

  // ── Build + prove + balance N transfers against the same chain state ─────
  heading('Build, prove and balance (one sender wallet live at a time)');
  const stateHeight = await blockHeight(config);
  type Ready = {
    account: Account;
    label: string;
    nextPrivateState: CftPrivateState;
    finalized?: FinalizedTransaction;
    balanceError?: string;
  };
  const ready: Ready[] = [];
  for (const s of senders) {
    const mine = pairs.filter((p) => p.sender === s);
    await withOwnWallet(s, async (w) => {
      const { providers, client } = await attach(s, w, address);
      const b = await client.balances();
      if (b.spendable === undefined || b.spendable < amount) throw new Error(`${s.name}: spendable ${b.spendable} < ${amount}`);
      for (const { recipient } of mine) {
        const label = `${s.name} → ${recipient.name}`;
        const t0 = Date.now();
        // Every transfer is built from the same spendable balance (same chain state), each with a fresh seed.
        let st = await client.state();
        st = CftPrivateState.withSpendableCandidate(st, b.spendable - amount);
        st = CftPrivateState.withFreshSeed(st);
        await client.setState(st);
        const unproven = await createUnprovenCallTx(providers, {
          compiledContract,
          circuitId: 'transfer',
          contractAddress: address as ContractAddress,
          privateStateId: PRIVATE_STATE_ID,
          args: [fromHex(recipient.accountId), amount],
        });
        const t1 = Date.now();
        const unbound = await providers.proofProvider.proveTx(unproven.private.unprovenTx);
        const t2 = Date.now();
        try {
          const finalized = await providers.walletProvider.balanceTx(unbound);
          ready.push({ account: s, label, nextPrivateState: unproven.private.nextPrivateState, finalized });
          log(`${label}: built ${((t1 - t0) / 1000).toFixed(1)}s, proved ${((t2 - t1) / 1000).toFixed(1)}s, balanced ${((Date.now() - t2) / 1000).toFixed(1)}s`);
        } catch (e) {
          ready.push({ account: s, label, nextPrivateState: unproven.private.nextPrivateState, balanceError: rootCause(e) });
          warn(`${label}: built and proved, but the wallet could not pay for it: ${rootCause(e)}`);
        }
      }
    });
  }
  log(`${ready.filter((r) => r.finalized).length}/${ready.length} transfers ready, all built against the state at block ${stateHeight}`);

  // ── Submit everything at once (relayed through the funder), then observe ─
  heading('Submit all at once');
  const submitHeight = await blockHeight(config);
  const submitStarted = Date.now();
  const submitted = await Promise.all(
    ready.map(async (f) => {
      if (!f.finalized) return { ...f, txId: undefined as string | undefined, submitError: `not submitted: ${f.balanceError}` };
      try {
        const txId = await issuerProviders.midnightProvider.submitTx(f.finalized);
        return { ...f, txId, submitError: undefined as string | undefined };
      } catch (e) {
        return { ...f, txId: undefined as string | undefined, submitError: rootCause(e) };
      }
    }),
  );
  log(`submitted ${submitted.filter((s) => s.txId).length}/${submitted.length} at block ${submitHeight} (built at ${stateHeight}) within ${Date.now() - submitStarted}ms`);
  for (const s of submitted.filter((s) => s.submitError && s.finalized)) warn(`${s.label}: rejected at submit: ${s.submitError}`);

  const outcomes = await Promise.all(
    submitted.map(async (s) => {
      if (!s.txId) return { ...s, data: undefined as FinalizedTxData | undefined, error: s.submitError };
      try {
        const data = await withTimeout(issuerProviders.publicDataProvider.watchForTxData(s.txId), 180_000, s.label);
        return { ...s, data, error: undefined as string | undefined };
      } catch (e) {
        return { ...s, data: undefined as FinalizedTxData | undefined, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  if (submitted.some((s) => s.submitError && s.finalized)) {
    const reasons = await nodeRejectionReasons(networkName, submitStarted);
    if (reasons) log(`node pre-dispatch rejections since submit: ${reasons}`);
  }
  // Persist the private state of the successful calls (seed, cache) like a wallet would.
  for (const o of outcomes) {
    if (o.data?.status === 'SucceedEntirely') {
      const providers = await providersFor(o.account, funder);
      providers.privateStateProvider.setContractAddress(address as ContractAddress);
      await providers.privateStateProvider.set(PRIVATE_STATE_ID, o.nextPrivateState);
    }
  }

  // ── Results ──────────────────────────────────────────────────────────────
  heading('Results');
  const byBlock = new Map<number, { ok: number; failed: number; labels: string[] }>();
  for (const o of outcomes) {
    const h = o.data?.blockHeight ?? -1;
    const entry = byBlock.get(h) ?? { ok: 0, failed: 0, labels: [] };
    const success = o.data?.status === 'SucceedEntirely';
    if (success) entry.ok++;
    else entry.failed++;
    entry.labels.push(`${o.label} ${success ? c.green + '✓' : c.red + '✗'}${c.reset}${o.data ? ` ${o.data.status}, fee ${o.data.fees.paidFees}` : ''}${o.error ? ` (${o.error})` : ''}`);
    byBlock.set(h, entry);
  }
  for (const [h, e] of [...byBlock.entries()].sort((a, b) => a[0] - b[0])) {
    log(`${c.bold}block ${h === -1 ? 'none' : h}${c.reset}${h === -1 ? '' : ` (+${h - submitHeight} after submit)`}: ${e.ok} succeeded, ${e.failed} failed`);
    for (const l of e.labels) log(`   ${l}`);
  }
  const succeeded = outcomes.filter((o) => o.data?.status === 'SucceedEntirely').length;
  const notPaid = outcomes.filter((o) => !o.finalized).length;
  const rejectedAtSubmit = outcomes.filter((o) => o.finalized && !o.txId).length;
  const includedButFailed = outcomes.filter((o) => o.data && o.data.status !== 'SucceedEntirely').length;
  const blocksUsed = [...byBlock.keys()].filter((h) => h !== -1);
  const maxPerBlock = Math.max(0, ...[...byBlock.entries()].filter(([h]) => h !== -1).map(([, e]) => e.ok));
  ok(
    `${succeeded}/${outcomes.length} succeeded (${notPaid} the wallet could not pay for, ${rejectedAtSubmit} rejected by the node before inclusion, ${includedButFailed} included but failed); ` +
      `successes spread over ${blocksUsed.length} block(s); max successful per block: ${maxPerBlock}`,
  );

  // ── Verify the ledger agrees ─────────────────────────────────────────────
  heading('Ledger check');
  const token = await issuer.token();
  log(`totalSupply ${formatAmount(token.totalSupply, DECIMALS)} BNCH, registered ${token.accounts.length}`);
  for (const r of recipients) {
    const { client } = await attach(r, funder, address);
    const b = await client.balances();
    log(`${r.name.padEnd(12)} pending=${formatAmount(b.pending ?? -1n, DECIMALS).padStart(8)} (${b.pendingSource}) credits=[${b.memos.map((m) => formatAmount(m, DECIMALS)).join(', ')}]`);
  }
  for (const s of senders) {
    const { client } = await attach(s, funder, address);
    const b = await client.balances();
    log(`${s.name.padEnd(12)} spendable=${formatAmount(b.spendable ?? -1n, DECIMALS).padStart(8)} (${b.spendableSource})`);
  }
  ok(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(0);
};

main().catch((e) => {
  console.error(`\n${c.red}bench failed:${c.reset}`, e);
  process.exit(1);
});
