// React context for the 1AM wallet connection (DApp Connector v4).
//
// This template connects to 1AM only. Other v4 wallets injected under
// `window.midnight` are ignored; see `wallet.ts` if you want to offer a picker.
// The connection is restored automatically on reload: the connector remembers
// the dApp's authorisation, so `connect()` resolves without a prompt.
//
// There is no network selector: the app follows whichever network the wallet is
// on. DApp Connector v4 needs a network id to connect with, so we try the last
// known network first, read back the network the wallet is actually on, and
// reconnect with that if it differs.
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { DEFAULT_NETWORK_ID, NETWORK_IDS, isNetworkId, type NetworkId } from './networks';
import { describeError, find1am, isAPIError, listWallets, waitForWallets, type WalletEntry } from './wallet';

export interface Balances {
  /** Unshielded token balances keyed by token type (hex). */
  unshielded: Record<string, bigint>;
  /** Spendable DUST and the cap derived from the NIGHT balance. */
  dust: { balance: bigint; cap: bigint };
}

export interface WalletKeys {
  /** Bech32m shielded coin public key, from `getShieldedAddresses()`. */
  coinPublicKey: string;
  /** Bech32m shielded encryption public key, from `getShieldedAddresses()`. */
  encryptionPublicKey: string;
}

export type WalletState =
  | { status: 'detecting' }
  /** 1AM is not injected on this page. */
  | { status: 'no-wallet' }
  | { status: 'disconnected'; wallet: WalletEntry; notice?: string }
  | { status: 'connecting'; wallet: WalletEntry }
  | {
      status: 'connected';
      wallet: WalletEntry;
      api: ConnectedAPI;
      networkId: NetworkId;
      address: string;
      shieldedAddress: string;
      keys: WalletKeys;
      balances?: Balances;
      balancesError?: string;
    }
  | { status: 'error'; wallet: WalletEntry; message: string };

export interface WalletContextValue {
  state: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
  rescan: () => void;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

/** Last network the wallet was seen on; tried first on the next connect. */
const STORAGE_NETWORK = 'midnight-starter:networkId';
/** Set after a successful connection, cleared on an explicit disconnect. */
const STORAGE_AUTOCONNECT = 'midnight-starter:autoconnect';
const STATUS_POLL_MS = 5_000;

const readStorage = (key: string): string | undefined => {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};
const writeStorage = (key: string, value: string | undefined) => {
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

const fetchBalances = async (api: ConnectedAPI): Promise<Balances> => {
  const [unshielded, dust] = await Promise.all([api.getUnshieldedBalances(), api.getDustBalance()]);
  return { unshielded, dust };
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: 'detecting' });
  const lastNetworkRef = useRef<NetworkId>(
    (() => {
      const stored = readStorage(STORAGE_NETWORK);
      return isNetworkId(stored) ? stored : DEFAULT_NETWORK_ID;
    })(),
  );
  // Guards against stale async results after a disconnect / reconnect.
  const sessionRef = useRef(0);
  // Latest connect(), so the one-time detection effect can auto-reconnect.
  const connectRef = useRef<() => Promise<void>>(async () => {});

  const connect = useCallback(async () => {
    const wallet = find1am(listWallets());
    if (!wallet) {
      setState({ status: 'no-wallet' });
      return;
    }
    const session = ++sessionRef.current;
    setState({ status: 'connecting', wallet });

    // Try the last known network first, then the others. A wallet on a
    // different network either reports it (we follow) or rejects the hint (we
    // move on). A user rejection stops the whole attempt.
    const preferred = lastNetworkRef.current;
    const order: NetworkId[] = [preferred, ...NETWORK_IDS.filter((n) => n !== preferred)];
    let lastError: unknown;

    try {
      for (const hint of order) {
        let api: ConnectedAPI;
        try {
          api = await wallet.api.connect(hint);
        } catch (e) {
          if (isAPIError(e) && (e.code === 'Rejected' || e.code === 'PermissionRejected')) throw e;
          lastError = e;
          continue;
        }
        if (session !== sessionRef.current) return;

        let status = await api.getConnectionStatus();
        if (status.status !== 'connected') {
          lastError = new Error('The wallet reported the connection as disconnected.');
          continue;
        }
        let networkId = status.networkId;
        if (networkId !== hint) {
          // The wallet is on another network: follow it.
          if (!isNetworkId(networkId)) {
            throw new Error(`1AM is on network "${networkId}", which this app does not know. Switch networks in the wallet.`);
          }
          api = await wallet.api.connect(networkId);
          if (session !== sessionRef.current) return;
          status = await api.getConnectionStatus();
          if (status.status !== 'connected' || status.networkId !== networkId) {
            throw new Error(`Could not connect on the wallet's network ("${networkId}").`);
          }
        }
        if (!isNetworkId(networkId)) continue;

        // Lets the wallet batch permission prompts up front. Optional per spec.
        try {
          await api.hintUsage([
            'getUnshieldedAddress',
            'getShieldedAddresses',
            'getUnshieldedBalances',
            'getDustBalance',
            'balanceUnsealedTransaction',
            'submitTransaction',
            'getProvingProvider',
          ]);
        } catch {
          /* wallet may not implement hints meaningfully */
        }

        const [{ unshieldedAddress }, shielded] = await Promise.all([api.getUnshieldedAddress(), api.getShieldedAddresses()]);
        if (session !== sessionRef.current) return;

        lastNetworkRef.current = networkId;
        writeStorage(STORAGE_NETWORK, networkId);
        writeStorage(STORAGE_AUTOCONNECT, '1');
        setState({
          status: 'connected',
          wallet,
          api,
          networkId,
          address: unshieldedAddress,
          shieldedAddress: shielded.shieldedAddress,
          keys: { coinPublicKey: shielded.shieldedCoinPublicKey, encryptionPublicKey: shielded.shieldedEncryptionPublicKey },
        });

        try {
          const balances = await fetchBalances(api);
          if (session !== sessionRef.current) return;
          setState((prev) => (prev.status === 'connected' ? { ...prev, balances } : prev));
        } catch (error) {
          if (session !== sessionRef.current) return;
          const balancesError = describeError(error);
          setState((prev) => (prev.status === 'connected' ? { ...prev, balancesError } : prev));
        }
        return;
      }
      throw lastError ?? new Error('1AM did not accept a connection on any known network.');
    } catch (error) {
      if (session !== sessionRef.current) return;
      writeStorage(STORAGE_AUTOCONNECT, undefined);
      setState({ status: 'error', wallet, message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const detect = useCallback(async (autoReconnect: boolean) => {
    const session = ++sessionRef.current;
    setState({ status: 'detecting' });
    const wallet = find1am(await waitForWallets());
    if (session !== sessionRef.current) return;
    if (!wallet) {
      setState({ status: 'no-wallet' });
      return;
    }
    setState({ status: 'disconnected', wallet });
    if (autoReconnect && readStorage(STORAGE_AUTOCONNECT) === '1') void connectRef.current();
  }, []);

  useEffect(() => {
    void detect(true);
  }, [detect]);

  const disconnect = useCallback(() => {
    // v4 has no wallet-side disconnect; dropping the ConnectedAPI reference is the whole story.
    sessionRef.current++;
    writeStorage(STORAGE_AUTOCONNECT, undefined);
    const wallet = find1am(listWallets());
    setState(wallet ? { status: 'disconnected', wallet } : { status: 'no-wallet' });
  }, []);

  const refreshBalances = useCallback(async () => {
    if (state.status !== 'connected') return;
    const session = sessionRef.current;
    try {
      const balances = await fetchBalances(state.api);
      if (session !== sessionRef.current) return;
      setState((prev) => (prev.status === 'connected' ? { ...prev, balances, balancesError: undefined } : prev));
    } catch (error) {
      if (session !== sessionRef.current) return;
      if (isAPIError(error) && error.code === 'Disconnected') {
        setState({ status: 'disconnected', wallet: state.wallet, notice: describeError(error) });
        return;
      }
      const balancesError = describeError(error);
      setState((prev) => (prev.status === 'connected' ? { ...prev, balancesError } : prev));
    }
  }, [state]);

  // v4 has no events, so poll the connection status while connected.
  useEffect(() => {
    if (state.status !== 'connected') return;
    const { api, wallet } = state;
    const session = sessionRef.current;
    const timer = window.setInterval(async () => {
      try {
        const status = await api.getConnectionStatus();
        if (session !== sessionRef.current) return;
        if (status.status === 'disconnected') {
          sessionRef.current++;
          setState({ status: 'disconnected', wallet, notice: 'The wallet disconnected.' });
        } else if (status.networkId !== state.networkId) {
          // The user switched networks inside 1AM: reconnect and follow.
          void connectRef.current();
        }
      } catch (error) {
        if (session !== sessionRef.current) return;
        sessionRef.current++;
        setState({ status: 'disconnected', wallet, notice: describeError(error) });
      }
    }, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [state]);

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      connect,
      disconnect,
      refreshBalances,
      rescan: () => void detect(false),
    }),
    [state, connect, disconnect, refreshBalances, detect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
