// Read a token and an account out of the public ledger state, and resolve the
// encrypted balances with a viewing key. Shared by the browser and the CLI.
import type { EcdhMask_Ciphertext, ElGamal_Ciphertext, Ledger } from './managed/cft/contract/index.js';
import {
  bytesEqual,
  decryptMemo,
  decryptToPoint,
  fromHex,
  hexToScalar,
  isZeroCiphertext,
  pointKey,
  recoverBalance,
  toHex,
  valuePoint,
  verifyBalance,
} from './crypto.js';
import { CftPrivateState } from './witnesses.js';

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  /** Public: every mint / burn amount is visible as a supply delta. */
  totalSupply: bigint;
  issuerAccountId: string;
  /** Every registered accountId (hex). Public: the ids are ledger map keys. */
  accounts: string[];
}

export interface AccountView {
  accountId: string;
  registered: boolean;
  spendableCt: ElGamal_Ciphertext | undefined;
  pendingCt: ElGamal_Ciphertext | undefined;
  /** Newest first (the module pushes to the front). */
  memos: EcdhMask_Ciphertext[];
}

export const registeredAccounts = (ledger: Ledger): string[] =>
  [...ledger.CFT__encryptionKeys].map(([id]) => toHex(id));

export const readToken = (ledger: Ledger): TokenInfo => ({
  name: ledger.CFT__name,
  symbol: ledger.CFT__symbol,
  decimals: Number(ledger.CFT__decimals),
  totalSupply: ledger.Supply__totalSupply,
  issuerAccountId: toHex(ledger.Ownable__owner.left),
  accounts: registeredAccounts(ledger),
});

export const readAccount = (ledger: Ledger, accountIdHex: string): AccountView => {
  const id = fromHex(accountIdHex);
  const registered = ledger.CFT__encryptionKeys.member(id);
  return {
    accountId: accountIdHex,
    registered,
    spendableCt: registered && ledger.CFT__balances.member(id) ? ledger.CFT__balances.lookup(id) : undefined,
    pendingCt: registered && ledger.CFT__pending.member(id) ? ledger.CFT__pending.lookup(id) : undefined,
    memos: ledger.CFT__memos.member(id) ? [...ledger.CFT__memos.lookup(id)] : [],
  };
};

export const isIssuer = (ledger: Ledger, accountIdHex: string): boolean =>
  ledger.Ownable__owner.is_left && bytesEqual(ledger.Ownable__owner.left, fromHex(accountIdHex));

export type BalanceSource = 'cache' | 'zero' | 'memos' | 'candidate' | 'recovered' | 'unknown';

export interface ResolvedBalance {
  value: bigint | undefined;
  source: BalanceSource;
}

/** Amounts are Uint<128>; a memo opened with the wrong key decrypts to a random field element far outside that. */
const MAX_AMOUNT = (1n << 128n) - 1n;
const isAmount = (v: bigint): boolean => v >= 0n && v <= MAX_AMOUNT;

/** Decrypt every credit memo for the account with its viewing key (newest first). */
export const memoHistory = (view: AccountView, viewingKeyHex: string): bigint[] => {
  const s = hexToScalar(viewingKeyHex);
  return view.memos.map((m) => decryptMemo(m, s));
};

/** Cache, else bounded discrete-log, else unknown. */
const resolveByRecovery = (ct: ElGamal_Ciphertext, viewingKeyHex: string, maxValue?: bigint): ResolvedBalance => {
  const recovered = recoverBalance(ct, hexToScalar(viewingKeyHex), maxValue);
  if (recovered === undefined) return { value: undefined, source: 'unknown' };
  return { value: recovered, source: recovered === 0n ? 'zero' : 'recovered' };
};

/**
 * Pending balance from the memo channel, exactly and for any amount.
 *
 * `pending` only changes by credits (each leaves a memo, newest first) or by a
 * reset to zero (sweep). Its plaintext is therefore always the sum of the
 * newest k memos for some k: try k = 0..n and accept the one whose g^sum equals
 * the decrypted point.
 */
export const resolvePending = (view: AccountView, viewingKeyHex: string): ResolvedBalance => {
  const ct = view.pendingCt;
  if (!ct || isZeroCiphertext(ct)) return { value: 0n, source: 'zero' };
  const s = hexToScalar(viewingKeyHex);
  const target = pointKey(decryptToPoint(ct, s));
  const memoValues = view.memos.map((m) => decryptMemo(m, s));
  if (memoValues.every(isAmount)) {
    let sum = 0n;
    for (let k = 0; k <= memoValues.length; k++) {
      if (!isAmount(sum)) break;
      if (pointKey(valuePoint(sum)) === target) return { value: sum, source: 'memos' };
      if (k < memoValues.length) sum += memoValues[k]!;
    }
  }
  return resolveByRecovery(ct, viewingKeyHex);
};

/**
 * Spendable balance: the wallet cache, else one of the values the wallet
 * expected after its own recent moves (verified against the ciphertext), else
 * memo-derived candidates, else bounded recovery, else unknown.
 */
export const resolveSpendable = (view: AccountView, viewingKeyHex: string, state?: CftPrivateState): ResolvedBalance => {
  const ct = view.spendableCt;
  if (!ct || isZeroCiphertext(ct)) return { value: 0n, source: 'zero' };
  const s = hexToScalar(viewingKeyHex);
  if (state) {
    const cached = CftPrivateState.lookupPlaintext(state, ct);
    if (cached !== undefined) return { value: cached, source: 'cache' };
    for (const c of state.spendableCandidates ?? []) {
      const v = BigInt(c);
      if (verifyBalance(ct, s, v)) return { value: v, source: 'candidate' };
    }
  }
  // An account that swept everything it received and never spent holds exactly
  // the sum of its memos. Try that (and minus the newest credit, which may still
  // be pending) before falling back to bounded recovery.
  const memoValues = view.memos.map((m) => decryptMemo(m, s));
  const total = memoValues.reduce((a, v) => a + v, 0n);
  for (const candidate of [total, total - (memoValues[0] ?? 0n)]) {
    if (candidate > 0n && isAmount(candidate) && verifyBalance(ct, s, candidate)) return { value: candidate, source: 'memos' };
  }
  return resolveByRecovery(ct, viewingKeyHex);
};

// ── Amount formatting ──────────────────────────────────────────────────────

export const formatAmount = (units: bigint, decimals: number): string => {
  if (decimals === 0) return units.toString();
  const s = units.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
};

export const parseAmount = (text: string, decimals: number): bigint => {
  const m = text.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`invalid amount '${text}'`);
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new Error(`too many decimals (max ${decimals})`);
  return BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
};
