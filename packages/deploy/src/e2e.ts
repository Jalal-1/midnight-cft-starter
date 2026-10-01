// End-to-end check against a real network (the local devnet by default):
// deploy, register three accounts, mint, sweep, confidential transfer, burn.
//
//   pnpm e2e                                   (standalone devnet, genesis seed)
//   SEED=<64 hex> pnpm e2e -- --network preview
//
// One fee-paying wallet serves every actor; each actor has its own CFT identity
// (SK / EK) and private-state store, because CFT accounts are independent of
// the wallet that pays the fees.
import { CftClient, CftPrivateState, accountIdOf, deployCft, formatAmount, joinCft, parseAmount } from '@midnight-starter/contract';
import { GENESIS_SEED, selectNetwork } from './config.js';
import { arg, c, heading, log, ok, warn, withStatus } from './log.js';
import { compiledContract, makeProviders } from './providers.js';
import { dustBalance, ensureDust, nightBalance, startWallet, waitForNight, waitForSync } from './wallet.js';

const DECIMALS = 2;

const expectFailure = async (label: string, fn: () => Promise<unknown>, pattern: RegExp) => {
  try {
    await fn();
    throw new Error(`${label}: expected a failure but the call succeeded`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!pattern.test(msg)) throw new Error(`${label}: unexpected error: ${msg}`);
    ok(`${label} rejected as expected ${c.gray}(${pattern.source})${c.reset}`);
  }
};

const main = async () => {
  const networkName = arg('network', 'standalone')!;
  const config = selectNetwork(networkName);
  const seed = process.env.SEED ?? (networkName === 'standalone' ? GENESIS_SEED : undefined);
  if (!seed) throw new Error('SEED env var (hex) is required for public networks');
  const started = Date.now();

  heading(`CFT end-to-end on ${config.name}`);
  const wallet = await withStatus('Starting fee wallet', () => startWallet(config, seed));
  log(`fee wallet: ${wallet.address}`);
  await withStatus('Syncing wallet', () => waitForSync(wallet.wallet));
  let night = await nightBalance(wallet.wallet);
  if (night === 0n) {
    warn(`No NIGHT. Fund ${wallet.address} and wait...`);
    night = await withStatus('Waiting for NIGHT', () => waitForNight(wallet.wallet));
  }
  log(`NIGHT: ${formatAmount(night, 6)}`);
  log(`DUST: ${formatAmount(await ensureDust(wallet), 15)}`);

  const issuerState = CftPrivateState.generate();
  const aliceState = CftPrivateState.generate();
  const bobState = CftPrivateState.generate();
  log(`issuer accountId: ${accountIdOf(issuerState)}`);
  log(`alice  accountId: ${accountIdOf(aliceState)}`);
  log(`bob    accountId: ${accountIdOf(bobState)}`);

  heading('Deploy');
  const run = Date.now();
  const issuerProviders = await makeProviders(config, wallet, `e2e-${run}-issuer`);
  const deployed = await withStatus('Deploying Starter Token (STK, 2 decimals)', () =>
    deployCft(issuerProviders, compiledContract, issuerState, { name: 'Starter Token', symbol: 'STK', decimals: DECIMALS }),
  );
  const address = deployed.deployTxData.public.contractAddress;
  ok(`contract address: ${c.bold}${address}${c.reset}`);
  const issuer = new CftClient(issuerProviders, deployed, issuerState, compiledContract);

  const aliceProviders = await makeProviders(config, wallet, `e2e-${run}-alice`);
  const bobProviders = await makeProviders(config, wallet, `e2e-${run}-bob`);
  const alice = new CftClient(aliceProviders, await joinCft(aliceProviders, compiledContract, address, aliceState), aliceState, compiledContract);
  const bob = new CftClient(bobProviders, await joinCft(bobProviders, compiledContract, address, bobState), bobState, compiledContract);

  const show = async (label: string, who: CftClient) => {
    const b = await who.balances();
    const f = (v: bigint | undefined) => (v === undefined ? '?' : formatAmount(v, DECIMALS)).padStart(10);
    log(`${label.padEnd(7)} spendable=${f(b.spendable)} (${b.spendableSource})  pending=${f(b.pending)} (${b.pendingSource})`);
  };
  const supply = async () => log(`totalSupply (public): ${formatAmount((await issuer.token()).totalSupply, DECIMALS)} STK`);

  heading('Register (permissionless)');
  for (const [name, who] of [['issuer', issuer], ['alice', alice], ['bob', bob]] as const) {
    const r = await withStatus(`register ${name}`, () => who.register());
    log(`tx ${r.txId} @ block ${r.blockHeight}`);
  }
  log(`registered accounts: ${(await issuer.token()).accounts.length}`);

  heading('Mint (issuer → alice)');
  await withStatus('mint 1000.00 STK to alice', () => issuer.mint(alice.accountId, parseAmount('1000.00', DECIMALS)));
  await supply();
  await show('alice', alice);
  log(`alice memos: ${(await alice.balances()).memos.map((m) => formatAmount(m, DECIMALS)).join(', ')}`);
  await expectFailure('alice minting', () => alice.mint(bob.accountId, 1n), /not the owner|Ownable/i);

  heading('Sweep + confidential transfer (alice → bob)');
  await withStatus('alice sweep', () => alice.sweep());
  await withStatus('alice transfer 250.50 STK to bob', () => alice.transfer(bob.accountId, parseAmount('250.50', DECIMALS)));
  await show('alice', alice);
  await show('bob', bob);
  await expectFailure('overspend', () => bob.transfer(alice.accountId, parseAmount('999', DECIMALS)), /insufficient/i);

  heading('Burn (bob)');
  await withStatus('bob sweep', () => bob.sweep());
  await withStatus('bob burn 50.00 STK', () => bob.burn(parseAmount('50.00', DECIMALS)));
  await show('bob', bob);
  await supply();

  heading('Summary');
  const token = await issuer.token();
  log(`${token.name} (${token.symbol}), decimals ${token.decimals}, issuer ${token.issuerAccountId}`);
  log(`totalSupply ${formatAmount(token.totalSupply, DECIMALS)}, registered ${token.accounts.length}`);
  log(`DUST left: ${formatAmount(await dustBalance(wallet.wallet), 15)}`);
  ok(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(0);
};

main().catch((e) => {
  console.error(`\n${c.red}e2e failed:${c.reset}`, e);
  process.exit(1);
});
