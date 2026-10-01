// Deploy the CFT from a seed wallet and print the contract address.
//
//   pnpm deploy:contract -- --network standalone                       (local devnet, genesis seed)
//   SEED=<64 hex> pnpm deploy:contract -- --network preview --name "Confidential Dollar" --symbol cUSD --decimals 2
//
// The issuer identity (SK / EK) is written to packages/deploy/.state/<network>/issuer.json.
// Keep it secret: it is the only identity allowed to mint.
import fs from 'node:fs';
import path from 'node:path';
import { CftPrivateState, accountIdOf, deployCft } from '@midnight-starter/contract';
import { GENESIS_SEED, selectNetwork } from './config.js';
import { arg, heading, log, ok, warn, withStatus } from './log.js';
import { STATE_DIR, compiledContract, makeProviders } from './providers.js';
import { ensureDust, nightBalance, startWallet, waitForNight, waitForSync } from './wallet.js';

const main = async () => {
  const networkName = arg('network', 'standalone')!;
  const config = selectNetwork(networkName);
  const seed = process.env.SEED ?? (networkName === 'standalone' ? GENESIS_SEED : undefined);
  if (!seed) throw new Error('SEED env var (32-byte hex) is required for public networks');

  heading(`Deploy CFT on ${config.name}`);
  const wallet = await withStatus('Starting wallet', () => startWallet(config, seed));
  log(`fee wallet: ${wallet.address}`);
  await withStatus('Syncing wallet', () => waitForSync(wallet.wallet));
  if ((await nightBalance(wallet.wallet)) === 0n) {
    warn(`No NIGHT. Fund ${wallet.address}${config.faucet ? ` from ${config.faucet}` : ''} and wait...`);
    await withStatus('Waiting for NIGHT', () => waitForNight(wallet.wallet));
  }
  await ensureDust(wallet);

  const stateDir = path.join(STATE_DIR, config.name);
  fs.mkdirSync(stateDir, { recursive: true });
  const issuerPath = path.join(stateDir, 'issuer.json');
  let issuer: CftPrivateState;
  if (fs.existsSync(issuerPath)) {
    const saved = JSON.parse(fs.readFileSync(issuerPath, 'utf8')) as { secretKeyHex: string; encryptionKeyHex: string };
    issuer = CftPrivateState.fromSecrets(saved.secretKeyHex, saved.encryptionKeyHex);
    log(`reusing issuer identity from ${issuerPath}`);
  } else {
    issuer = CftPrivateState.generate();
    fs.writeFileSync(issuerPath, JSON.stringify({ secretKeyHex: issuer.secretKeyHex, encryptionKeyHex: issuer.encryptionKeyHex }, null, 2), {
      mode: 0o600,
    });
    log(`new issuer identity saved to ${issuerPath} (keep it secret)`);
  }
  log(`issuer accountId: ${accountIdOf(issuer)}`);

  const token = {
    name: arg('name', 'Starter Token')!,
    symbol: arg('symbol', 'STK')!,
    decimals: Number(arg('decimals', '2')),
  };
  const providers = await makeProviders(config, wallet, 'issuer');
  const deployed = await withStatus(`Deploying ${token.name} (${token.symbol}, ${token.decimals} decimals)`, () =>
    deployCft(providers, compiledContract, issuer, token),
  );
  const address = deployed.deployTxData.public.contractAddress;
  fs.appendFileSync(
    path.join(stateDir, 'deployments.txt'),
    `${new Date().toISOString()} ${address} ${token.name} ${token.symbol} ${token.decimals}\n`,
  );
  ok(`contract address: ${address}`);
  log(`tx ${deployed.deployTxData.public.txId} in block ${deployed.deployTxData.public.blockHeight}`);
  log('Paste the address into the web app ("Join an existing token") on the same network.');
  process.exit(0);
};

main().catch((e) => {
  console.error('\ndeploy failed:', e);
  process.exit(1);
});
