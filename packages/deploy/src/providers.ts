// Midnight.js providers for Node: ZK assets from disk, proofs from an HTTP
// proof server, private state in a local LevelDB, fees from the headless wallet.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { makeCompiledContract, type CftCircuitId, type CftProviders } from '@midnight-starter/contract';
import { WebSocket } from 'ws';
import type { NetworkConfig } from './config.js';
import { walletProviders, type HeadlessWallet } from './wallet.js';

// The indexer's GraphQL subscriptions need a WebSocket implementation in Node.
// @ts-expect-error: polyfill
globalThis.WebSocket = WebSocket;

const here = path.dirname(fileURLToPath(import.meta.url));
/** Compiled contract output (`compact compile` target) for the ZK assets. */
export const ZK_ASSETS_DIR = path.resolve(here, '..', '..', 'contract', 'src', 'managed', 'cft');
export const STATE_DIR = path.resolve(here, '..', '.state');

export const compiledContract = makeCompiledContract(ZK_ASSETS_DIR);

/**
 * One provider set per actor. The fee-paying wallet can be shared, but each
 * actor needs its own private-state store (it holds that actor's SK / EK).
 */
export const makeProviders = async (config: NetworkConfig, wallet: HeadlessWallet, actor: string): Promise<CftProviders> => {
  const zkConfigProvider = new NodeZkConfigProvider<CftCircuitId>(ZK_ASSETS_DIR);
  const walletAndMidnight = await walletProviders(wallet);
  return {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: path.join(STATE_DIR, config.name, 'private-state', actor),
      privateStateStoreName: 'cft',
      privateStoragePasswordProvider: () => process.env.PRIVATE_STATE_PASSWORD ?? 'Midnight-Starter-Dev-2026!',
      accountId: wallet.address,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnight,
    midnightProvider: walletAndMidnight,
  };
};
