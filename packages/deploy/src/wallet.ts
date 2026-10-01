// Seed-based headless wallet built from the Midnight wallet SDK (facade 3.0.0
// line, ledger-v8). It pays the DUST fees for deploys and circuit calls and is
// bridged to Midnight.js's WalletProvider + MidnightProvider.
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { nativeToken } from '@midnight-ntwrk/ledger-v8';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { MidnightProvider, UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';
import type { NetworkConfig } from './config.js';
import { withStatus } from './log.js';

export interface HeadlessWallet {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
  /** Bech32m unshielded address (where NIGHT lands). */
  address: string;
}

const deriveKeys = (seedHex: string) => {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('invalid seed');
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('key derivation failed');
  hd.hdWallet.clear();
  return derived.keys;
};

export const startWallet = async (config: NetworkConfig, seedHex: string): Promise<HeadlessWallet> => {
  const keys = deriveKeys(seedHex);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const networkId = getNetworkId();
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const indexerClientConnection = { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS };
  const relayURL = new URL(config.node.replace(/^http/, 'ws'));
  const provingServerUrl = new URL(config.proofServer);

  const shieldedConfig = { networkId, indexerClientConnection, provingServerUrl, relayURL };
  const unshieldedConfig = { networkId, indexerClientConnection, txHistoryStorage: new InMemoryTransactionHistoryStorage() };
  const dustConfig = {
    networkId,
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    indexerClientConnection,
    provingServerUrl,
    relayURL,
  };

  const wallet = await WalletFacade.init({
    configuration: { ...shieldedConfig, ...unshieldedConfig, ...dustConfig },
    shielded: () => ShieldedWallet(shieldedConfig).startWithSecretKeys(shieldedSecretKeys),
    unshielded: () => UnshieldedWallet(unshieldedConfig).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: () => DustWallet(dustConfig).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, address: unshieldedKeystore.getBech32Address().toString() };
};

const synced = (w: WalletFacade) => w.state().pipe(Rx.filter((s) => s.isSynced));

export const waitForSync = (w: WalletFacade) => Rx.firstValueFrom(synced(w).pipe(Rx.throttleTime(3_000)));

export const nightBalance = async (w: WalletFacade): Promise<bigint> =>
  (await Rx.firstValueFrom(synced(w))).unshielded.balances[nativeToken().raw] ?? 0n;

export const dustBalance = async (w: WalletFacade): Promise<bigint> =>
  (await Rx.firstValueFrom(synced(w))).dust.balance(new Date());

/** Resolve once the wallet holds NIGHT (after a faucet drip or a transfer). */
export const waitForNight = (w: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    synced(w).pipe(
      Rx.throttleTime(5_000),
      Rx.map((s) => s.unshielded.balances[nativeToken().raw] ?? 0n),
      Rx.filter((b) => b > 0n),
    ),
  );

/**
 * DUST pays every transaction fee and is generated only by NIGHT UTXOs that
 * were registered for it. Register any unregistered UTXOs, then wait for DUST.
 */
export const ensureDust = async (hw: HeadlessWallet): Promise<bigint> => {
  const state = await Rx.firstValueFrom(synced(hw.wallet));
  const now = state.dust.balance(new Date());
  if (now > 0n) return now;

  const unregistered = state.unshielded.availableCoins.filter(
    (coin: { meta?: { registeredForDustGeneration?: boolean } }) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (unregistered.length > 0) {
    await withStatus(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation`, async () => {
      const recipe = await hw.wallet.registerNightUtxosForDustGeneration(
        unregistered,
        hw.unshieldedKeystore.getPublicKey(),
        (payload) => hw.unshieldedKeystore.signData(payload),
      );
      await hw.wallet.submitTransaction(await hw.wallet.finalizeRecipe(recipe));
    });
  }
  return withStatus('Waiting for DUST to generate', () =>
    Rx.firstValueFrom(
      synced(hw.wallet).pipe(
        Rx.throttleTime(5_000),
        Rx.map((s) => s.dust.balance(new Date())),
        Rx.filter((b) => b > 0n),
      ),
    ),
  );
};

/** Bridge the wallet SDK to Midnight.js: balance (pay fees), sign and submit. */
export const walletProviders = async (hw: HeadlessWallet): Promise<WalletProvider & MidnightProvider> => {
  await Rx.firstValueFrom(synced(hw.wallet));
  return {
    getCoinPublicKey: (): ledger.CoinPublicKey => hw.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: (): ledger.EncPublicKey => hw.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<ledger.FinalizedTransaction> {
      const recipe = await hw.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: hw.shieldedSecretKeys, dustSecretKey: hw.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return hw.wallet.finalizeRecipe(recipe);
    },
    async submitTx(tx: ledger.FinalizedTransaction): Promise<ledger.TransactionId> {
      return hw.wallet.submitTransaction(tx);
    },
  };
};
