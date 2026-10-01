/**
 * Midnight network identifiers understood by DApp Connector v4 `connect(networkId)`.
 *
 * - preview    — public development network (1AM: indexer.preview.midnight.network)
 * - preprod    — public staging network (1AM: indexer.preprod.midnight.network)
 * - undeployed — local devnet (node + indexer + proof server via Docker)
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
}

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  preview: {
    id: 'preview',
    label: 'Preview',
    description: 'Public development network. Recommended for building and testing.',
  },
  preprod: {
    id: 'preprod',
    label: 'Preprod',
    description: 'Public staging network that mirrors mainnet behaviour.',
  },
  undeployed: {
    id: 'undeployed',
    label: 'Undeployed (local)',
    description: 'Local devnet running on your machine.',
    caution:
      'Requires a local node, indexer and proof server, and a wallet configured to use them. Not every wallet supports this network.',
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    description: 'Production network.',
    caution: 'Real funds. Double-check everything before submitting transactions.',
  },
};

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === 'string' && (NETWORK_IDS as readonly string[]).includes(value);
}

const envDefault = import.meta.env.VITE_DEFAULT_NETWORK_ID;

/** Initial selector value: env override if valid, otherwise `preview`. */
export const DEFAULT_NETWORK_ID: NetworkId = isNetworkId(envDefault) ? envDefault : 'preview';
