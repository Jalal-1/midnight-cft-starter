/**
 * Midnight network identifiers understood by DApp Connector v4 `connect(networkId)`,
 * plus the public service endpoints the dApp uses to read chain state.
 *
 * - preview    — public development network
 * - preprod    — public staging network
 * - undeployed — local devnet (`pnpm devnet:up`: node + indexer + proof server via Docker)
 * - mainnet    — production, real funds
 */
export const NETWORK_IDS = ['preview', 'preprod', 'undeployed', 'mainnet'] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export interface NetworkInfo {
  id: NetworkId;
  label: string;
  description: string;
  /** Shown under the selector when this network is chosen. */
  caution?: string;
  /** Indexer GraphQL endpoint (reads contract state). */
  indexer: string;
  /** Indexer GraphQL WebSocket endpoint (subscriptions). */
  indexerWs: string;
  /** HTTP proof server, used only when the wallet cannot prove in-wallet. */
  proofServer: string;
}

const publicNetwork = (id: 'preview' | 'preprod' | 'mainnet') => ({
  indexer: `https://indexer.${id}.midnight.network/api/v4/graphql`,
  indexerWs: `wss://indexer.${id}.midnight.network/api/v4/graphql/ws`,
  proofServer: 'http://127.0.0.1:6300',
});

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  preview: {
    id: 'preview',
    label: 'Preview',
    description: 'Public development network. Recommended for building and testing.',
    ...publicNetwork('preview'),
  },
  preprod: {
    id: 'preprod',
    label: 'Preprod',
    description: 'Public staging network that mirrors mainnet behaviour.',
    ...publicNetwork('preprod'),
  },
  undeployed: {
    id: 'undeployed',
    label: 'Undeployed (local)',
    description: 'Local devnet running on your machine (pnpm devnet:up).',
    caution:
      'Requires the local node, indexer and proof server, and a wallet configured to use them. Not every wallet supports this network.',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWs: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    proofServer: 'http://127.0.0.1:6300',
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    description: 'Production network.',
    caution: 'Real funds. Double-check everything before submitting transactions.',
    ...publicNetwork('mainnet'),
  },
};

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === 'string' && (NETWORK_IDS as readonly string[]).includes(value);
}

const envDefault = import.meta.env.VITE_DEFAULT_NETWORK_ID;

/** Initial selector value: env override if valid, otherwise `preview`. */
export const DEFAULT_NETWORK_ID: NetworkId = isNetworkId(envDefault) ? envDefault : 'preview';
