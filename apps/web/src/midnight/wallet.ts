/**
 * Framework-agnostic helpers for discovering and talking to Midnight wallets
 * that implement DApp Connector API v4 (https://docs.midnight.network/api-reference/dapp-connector).
 *
 * Wallets inject an `InitialAPI` under `window.midnight[<key>]`. The 1AM wallet
 * (https://1am.xyz) uses the key `'1am'` and `rdns: '1am'`. Lace uses `mnLace`.
 * Per the spec, DApps should enumerate `window.midnight` rather than hard-code a key,
 * so these helpers enumerate but let callers prefer 1AM.
 */
import { ErrorCodes, type APIError, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export const ONE_AM_KEY = '1am';
export const ONE_AM_RDNS = '1am';
export const ONE_AM_WEBSITE = 'https://1am.xyz';
export const ONE_AM_CHROME_STORE =
  'https://chromewebstore.google.com/detail/1am/bphnkdkcnfhompoegfpgnkidcjfbojjp';

/** Only connector API major version this starter targets. */
export const SUPPORTED_API_MAJOR = 4;

export interface WalletEntry {
  /** Key under `window.midnight` (e.g. `'1am'`, `'mnLace'`, or a UUID). */
  key: string;
  api: InitialAPI;
}

function majorVersion(version: unknown): number | undefined {
  if (typeof version !== 'string') return undefined;
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isNaN(major) ? undefined : major;
}

function looksLikeInitialApi(value: unknown): value is InitialAPI {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<InitialAPI>;
  return typeof v.connect === 'function' && typeof v.name === 'string';
}

/** Synchronously list every v4-compatible wallet currently injected on the page. */
export function listWallets(): WalletEntry[] {
  if (typeof window === 'undefined') return [];
  const injected = window.midnight ?? {};
  return Object.entries(injected)
    .filter(([, api]) => looksLikeInitialApi(api))
    .filter(([, api]) => majorVersion(api.apiVersion) === SUPPORTED_API_MAJOR)
    .map(([key, api]) => ({ key, api }));
}

export interface WaitForWalletsOptions {
  /** How many times to check. 1AM recommends 50. */
  attempts?: number;
  /** Delay between checks in ms. 1AM recommends 100. */
  intervalMs?: number;
}

/**
 * Extensions inject `window.midnight` before page load, but React may mount
 * before every wallet has finished. Poll briefly before concluding none exist.
 */
export async function waitForWallets({
  attempts = 50,
  intervalMs = 100,
}: WaitForWalletsOptions = {}): Promise<WalletEntry[]> {
  for (let i = 0; i < attempts; i++) {
    const wallets = listWallets();
    if (wallets.length > 0) return wallets;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return listWallets();
}

export function find1am(wallets: WalletEntry[]): WalletEntry | undefined {
  return wallets.find((w) => w.key === ONE_AM_KEY || w.api.rdns === ONE_AM_RDNS);
}

export function is1am(wallet: WalletEntry): boolean {
  return wallet.key === ONE_AM_KEY || wallet.api.rdns === ONE_AM_RDNS;
}

/** Spec: `APIError` is not a class, so check the `type` discriminator instead of `instanceof`. */
export function isAPIError(error: unknown): error is APIError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'DAppConnectorAPIError'
  );
}

/** Turn a connector error (or anything else thrown) into copy safe to show a user. */
export function describeError(error: unknown): string {
  if (isAPIError(error)) {
    switch (error.code) {
      case ErrorCodes.Rejected:
        return 'You declined the request in your wallet.';
      case ErrorCodes.PermissionRejected:
        return 'The wallet denied permission for this action. Check the dApp permissions in your wallet settings.';
      case ErrorCodes.Disconnected:
        return 'The wallet connection was lost. Please connect again.';
      case ErrorCodes.InvalidRequest:
        return `The wallet rejected the request as invalid: ${error.reason}`;
      case ErrorCodes.InternalError:
        return `The wallet hit an internal error: ${error.reason}`;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong while talking to the wallet.';
}

export function truncateAddress(address: string, head = 18, tail = 6): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Format a bigint token amount with a fixed number of decimals without
 * going through `Number` (which would lose precision above 2^53).
 * NIGHT and DUST both use 6 decimals.
 */
export function formatUnits(value: bigint, decimals = 6, maxFraction = 4): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const wholeStr = whole.toLocaleString('en-US');
  if (fraction === 0n || maxFraction === 0) return `${negative ? '-' : ''}${wholeStr}`;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, maxFraction)
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${wholeStr}${fractionStr ? `.${fractionStr}` : ''}`;
}
