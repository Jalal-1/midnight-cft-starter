// Midnight.js providers built on a connected DApp Connector v4 wallet.
//
// - Fees: the wallet balances the unbound transaction (adds DUST, or sponsors
//   it as 1AM does), signs and submits. The dApp never sees wallet keys.
// - Proving: delegated to the wallet when it exposes `getProvingProvider`
//   (1AM proves in-wallet), otherwise sent to an HTTP proof server.
// - ZK assets: prover / verifier keys and ZKIR served by this app under
//   /contract/cft (copied from the compiled contract at build time).
// - Private state (SK / EK / plaintext cache): LevelDB on IndexedDB, scoped to
//   the wallet address.
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  Transaction,
  type Binding,
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
} from '@midnight-ntwrk/ledger-v8';
import { dappConnectorProvingProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  createProofProvider,
  type MidnightProvider,
  type UnboundTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { fromHex, makeCompiledContract, toHex, type CftCircuitId, type CftProviders } from '@midnight-starter/contract';
import type { NetworkInfo } from './networks';

/** URL path (relative to the app origin) where the compiled ZK assets are served. */
export const ZK_ASSETS_PATH = 'contract/cft';

export const compiledContract = makeCompiledContract(`./${ZK_ASSETS_PATH}`);

export interface WalletKeys {
  /** Bech32m shielded coin public key, from `getShieldedAddresses()`. */
  coinPublicKey: string;
  /** Bech32m shielded encryption public key, from `getShieldedAddresses()`. */
  encryptionPublicKey: string;
}

/** WalletProvider + MidnightProvider on top of the connector. */
export const connectorWalletProviders = (api: ConnectedAPI, keys: WalletKeys): WalletProvider & MidnightProvider => ({
  getCoinPublicKey: () => keys.coinPublicKey as CoinPublicKey,
  getEncryptionPublicKey: () => keys.encryptionPublicKey as EncPublicKey,
  async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
    const { tx: balanced } = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
    return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced)) as Transaction<SignatureEnabled, Proof, Binding>;
  },
  async submitTx(tx: FinalizedTransaction): Promise<string> {
    await api.submitTransaction(toHex(tx.serialize()));
    return tx.identifiers()[0]!;
  },
});

export const canProveInWallet = (api: ConnectedAPI): boolean =>
  typeof (api as Partial<ConnectedAPI>).getProvingProvider === 'function';

export interface MakeProvidersOptions {
  api: ConnectedAPI;
  keys: WalletKeys;
  /** Wallet address used to scope the private-state store. */
  walletAddress: string;
  network: NetworkInfo;
  /** Override the HTTP proof server (only used when the wallet cannot prove). */
  proofServer?: string;
}

export const makeProviders = async ({ api, keys, walletAddress, network, proofServer }: MakeProvidersOptions): Promise<CftProviders> => {
  setNetworkId(network.id);
  // Absolute URL of the served ZK assets, honouring the app's base path.
  const zkConfigProvider = new FetchZkConfigProvider<CftCircuitId>(
    new URL(`${import.meta.env.BASE_URL}${ZK_ASSETS_PATH}`, window.location.origin).toString(),
    fetch.bind(window),
  );
  const proofProvider = canProveInWallet(api)
    ? createProofProvider(await dappConnectorProvingProvider(api, zkConfigProvider))
    : httpClientProofProvider(proofServer ?? network.proofServer, zkConfigProvider);
  const walletAndMidnight = connectorWalletProviders(api, keys);
  return {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: 'midnight-starter',
      privateStateStoreName: 'cft-private-state',
      // Encrypts the IndexedDB store at rest (Midnight.js requires 3 of: upper,
      // lower, digits, symbols). Replace with a user-supplied
      // password if the private state must survive a hostile device.
      privateStoragePasswordProvider: () => 'Midnight-Starter-Local-2026!',
      accountId: walletAddress,
    }),
    // Pass the browser's WebSocket explicitly: the isomorphic-ws shim the provider
    // defaults to has no named export in browsers.
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWs, WebSocket as never),
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnight,
    midnightProvider: walletAndMidnight,
  };
};
