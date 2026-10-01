// Network endpoints for the headless CLI. The browser app has its own copy in
// apps/web/src/midnight/networks.ts; keep the two in sync.
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export type NetworkId = 'undeployed' | 'preview' | 'preprod' | 'mainnet';

export interface NetworkConfig {
  readonly name: string;
  readonly networkId: NetworkId;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
  readonly faucet?: string;
}

const PROOF_SERVER = process.env.PROOF_SERVER ?? 'http://127.0.0.1:6300';

export const NETWORKS: Record<string, NetworkConfig> = {
  standalone: {
    name: 'standalone',
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:9944',
    proofServer: PROOF_SERVER,
  },
  preview: {
    name: 'preview',
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    proofServer: PROOF_SERVER,
    faucet: 'https://faucet.preview.midnight.network/',
  },
  preprod: {
    name: 'preprod',
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: PROOF_SERVER,
    faucet: 'https://faucet.preprod.midnight.network/',
  },
  mainnet: {
    name: 'mainnet',
    networkId: 'mainnet',
    indexer: 'https://indexer.mainnet.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.mainnet.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.mainnet.midnight.network',
    proofServer: PROOF_SERVER,
  },
};

/** Pick a network by name and make it the active Midnight.js network id. */
export const selectNetwork = (name: string): NetworkConfig => {
  const cfg = NETWORKS[name];
  if (!cfg) throw new Error(`Unknown network '${name}'. Use one of: ${Object.keys(NETWORKS).join(', ')}`);
  setNetworkId(cfg.networkId);
  return cfg;
};

/** The node's "dev" preset funds this seed on the standalone devnet. */
export const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
