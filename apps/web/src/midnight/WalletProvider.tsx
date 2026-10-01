import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { DEFAULT_NETWORK_ID, isNetworkId, type NetworkId } from './networks';
import {
  describeError,
  find1am,
  isAPIError,
  listWallets,
  waitForWallets,
  type WalletEntry,
} from './wallet';

export interface Balances {
  /** Sum of all unshielded token balances keyed by token type (hex). */
  unshielded: Record<string, bigint>;
  /** Spendable DUST and the cap derived from the NIGHT balance. */
  dust: { balance: bigint; cap: bigint };
}

export type WalletState =
  | { status: 'detecting' }
  | { status: 'no-wallet' }
  | { status: 'disconnected'; wallets: WalletEntry[]; notice?: string }
  | { status: 'connecting'; wallets: WalletEntry[]; wallet: WalletEntry; networkId: NetworkId }
  | {
      status: 'connected';
      wallets: WalletEntry[];
      wallet: WalletEntry;
      api: ConnectedAPI;
      networkId: NetworkId;
      address: string;
      shieldedAddress?: string;
      balances?: Balances;
      balancesError?: string;
    }
  | { status: 'error'; wallets: WalletEntry[]; message: string };

export interface WalletContextValue {
  state: WalletState;
  /** Network currently chosen in the UI (persisted across reloads). */
  networkId: NetworkId;
  setNetworkId: (id: NetworkId) => void;
  /** The 1AM entry if present, used to highlight it in the UI. */
  preferredWallet?: WalletEntry;
  /** Key of the wallet used last time, so the UI can offer "Reconnect". */
  lastWalletKey?: string;
  connect: (walletKey?: string) => Promise<void>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
  revealShieldedAddress: () => Promise<void>;
  rescanWallets: () => void;
}

export const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_NETWORK = 'midnight-starter:networkId';
const STORAGE_WALLET = 'midnight-starter:walletKey';
const STATUS_POLL_MS = 5_000;

function readStorage(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string | undefined) {
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode, blocked) — ignore
  }
}

async function fetchBalances(api: ConnectedAPI): Promise<Balances> {
  const [unshielded, dust] = await Promise.all([api.getUnshieldedBalances(), api.getDustBalance()]);
  return { unshielded, dust };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: 'detecting' });
  const [networkId, setNetworkIdState] = useState<NetworkId>(() => {
    const stored = readStorage(STORAGE_NETWORK);
    return isNetworkId(stored) ? stored : DEFAULT_NETWORK_ID;
  });
  const [lastWalletKey, setLastWalletKey] = useState<string | undefined>(() =>
    readStorage(STORAGE_WALLET),
  );
  // Guards against stale async results after a disconnect/reconnect.
  const sessionRef = useRef(0);

  const detect = useCallback(async () => {
    const session = ++sessionRef.current;
    setState({ status: 'detecting' });
    const wallets = await waitForWallets();
    if (session !== sessionRef.current) return;
    setState(wallets.length === 0 ? { status: 'no-wallet' } : { status: 'disconnected', wallets });
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  const setNetworkId = useCallback((id: NetworkId) => {
    setNetworkIdState(id);
    writeStorage(STORAGE_NETWORK, id);
  }, []);

  const disconnect = useCallback(() => {
    // v4 has no wallet-side disconnect; dropping the ConnectedAPI reference is the whole story.
    sessionRef.current++;
    setState({ status: 'disconnected', wallets: listWallets() });
  }, []);

  const connect = useCallback(
    async (walletKey?: string) => {
      const wallets = listWallets();
      const wallet =
        (walletKey ? wallets.find((w) => w.key === walletKey) : undefined) ??
        find1am(wallets) ??
        wallets[0];
      if (!wallet) {
        setState({ status: 'no-wallet' });
        return;
      }

      const session = ++sessionRef.current;
      const target = networkId;
      setState({ status: 'connecting', wallets, wallet, networkId: target });

      try {
        const api = await wallet.api.connect(target);
        if (session !== sessionRef.current) return;

        // Lets the wallet batch permission prompts up front. Optional per spec, so never fatal.
        try {
          await api.hintUsage([
            'getUnshieldedAddress',
            'getUnshieldedBalances',
            'getDustBalance',
            'getShieldedAddresses',
          ]);
        } catch {
          /* wallet may not implement hints meaningfully */
        }

        const status = await api.getConnectionStatus();
        if (session !== sessionRef.current) return;
        if (status.status === 'disconnected') {
          throw new Error('The wallet reported the connection as disconnected.');
        }
        if (status.networkId !== target) {
          throw new Error(
            `Your wallet is on "${status.networkId}" but you selected "${target}". Switch the network in your wallet or in the selector, then try again.`,
          );
        }

        const { unshieldedAddress } = await api.getUnshieldedAddress();
        if (session !== sessionRef.current) return;

        setLastWalletKey(wallet.key);
        writeStorage(STORAGE_WALLET, wallet.key);
        setState({
          status: 'connected',
          wallets,
          wallet,
          api,
          networkId: target,
          address: unshieldedAddress,
        });

        // Balances are best-effort: a failure here should not undo a successful connection.
        try {
          const balances = await fetchBalances(api);
          if (session !== sessionRef.current) return;
          setState((prev) => (prev.status === 'connected' ? { ...prev, balances } : prev));
        } catch (error) {
          if (session !== sessionRef.current) return;
          const balancesError = describeError(error);
          setState((prev) => (prev.status === 'connected' ? { ...prev, balancesError } : prev));
        }
      } catch (error) {
        if (session !== sessionRef.current) return;
        setState({ status: 'error', wallets, message: describeError(error) });
      }
    },
    [networkId],
  );

  const refreshBalances = useCallback(async () => {
    if (state.status !== 'connected') return;
    const session = sessionRef.current;
    try {
      const balances = await fetchBalances(state.api);
      if (session !== sessionRef.current) return;
      setState((prev) =>
        prev.status === 'connected' ? { ...prev, balances, balancesError: undefined } : prev,
      );
    } catch (error) {
      if (session !== sessionRef.current) return;
      if (isAPIError(error) && error.code === 'Disconnected') {
        setState({ status: 'disconnected', wallets: listWallets(), notice: describeError(error) });
        return;
      }
      const balancesError = describeError(error);
      setState((prev) => (prev.status === 'connected' ? { ...prev, balancesError } : prev));
    }
  }, [state]);

  const revealShieldedAddress = useCallback(async () => {
    if (state.status !== 'connected') return;
    const session = sessionRef.current;
    try {
      const { shieldedAddress } = await state.api.getShieldedAddresses();
      if (session !== sessionRef.current) return;
      setState((prev) => (prev.status === 'connected' ? { ...prev, shieldedAddress } : prev));
    } catch (error) {
      if (session !== sessionRef.current) return;
      const balancesError = describeError(error);
      setState((prev) => (prev.status === 'connected' ? { ...prev, balancesError } : prev));
    }
  }, [state]);

  // v4 has no events, so poll the connection status while connected.
  useEffect(() => {
    if (state.status !== 'connected') return;
    const { api } = state;
    const session = sessionRef.current;
    const timer = window.setInterval(async () => {
      try {
        const status = await api.getConnectionStatus();
        if (session !== sessionRef.current) return;
        if (status.status === 'disconnected') {
          sessionRef.current++;
          setState({
            status: 'disconnected',
            wallets: listWallets(),
            notice: 'The wallet disconnected.',
          });
        }
      } catch (error) {
        if (session !== sessionRef.current) return;
        sessionRef.current++;
        setState({ status: 'disconnected', wallets: listWallets(), notice: describeError(error) });
      }
    }, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [state]);

  const preferredWallet = useMemo(
    () => ('wallets' in state ? find1am(state.wallets) : undefined),
    [state],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      networkId,
      setNetworkId,
      preferredWallet,
      lastWalletKey,
      connect,
      disconnect,
      refreshBalances,
      revealShieldedAddress,
      rescanWallets: () => void detect(),
    }),
    [
      state,
      networkId,
      setNetworkId,
      preferredWallet,
      lastWalletKey,
      connect,
      disconnect,
      refreshBalances,
      revealShieldedAddress,
      detect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
