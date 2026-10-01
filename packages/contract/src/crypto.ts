// Wallet-side cryptography for the CFT: byte helpers, ciphertext keys, key
// derivation, memo decryption and bounded discrete-log recovery of balances.
//
// Everything that touches the curve goes through the contract's exported pure
// circuits (or compact-runtime built-ins), so wallet and circuit can never
// disagree about the arithmetic. The one exception is the baby-step giant-step
// search, which runs on @noble/curves' pure-JS Jubjub for speed and is checked
// against the runtime's generator before use.
import { ecMulGenerator, type JubjubPoint } from '@midnight-ntwrk/compact-runtime';
import { jubjub } from '@noble/curves/misc.js';
import {
  pureCircuits,
  type EcdhMask_Ciphertext,
  type ElGamal_Ciphertext,
} from './managed/cft/contract/index.js';

export type { EcdhMask_Ciphertext, ElGamal_Ciphertext, JubjubPoint };

/** Order of the Jubjub prime-order subgroup (the scalar field). */
export const JUBJUB_SUBGROUP_ORDER =
  6554484396890773809930967563523245729705921265872317281365359162392183254199n;

// ── Bytes ──────────────────────────────────────────────────────────────────

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const clean = hex.trim().replace(/^0x/, '');
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error('invalid hex string');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const randomBytes32 = (): Uint8Array => {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return b;
};

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** 32-byte account id as lowercase hex, validated. */
export const normalizeAccountId = (hex: string): string => {
  const bytes = fromHex(hex);
  if (bytes.length !== 32) throw new Error('account id must be 32 bytes of hex');
  return toHex(bytes);
};

// ── Points and ciphertexts ─────────────────────────────────────────────────

export const pointKey = (p: JubjubPoint): string => `${p.x.toString(16)}:${p.y.toString(16)}`;

/** Canonical cache key for a ciphertext (same serialization as OZ's reference witness). */
export const ctKey = (ct: ElGamal_Ciphertext): string =>
  `${ct.c1.x.toString(16)}:${ct.c1.y.toString(16)}:${ct.c2.x.toString(16)}:${ct.c2.y.toString(16)}`;

const IDENTITY_KEY = pointKey(ecMulGenerator(0n));

/** `ElGamal_encryptZero()` is the fixed (identity, identity) pair; it decrypts to 0 under any key. */
export const isZeroCiphertext = (ct: ElGamal_Ciphertext): boolean =>
  pointKey(ct.c1) === IDENTITY_KEY && pointKey(ct.c2) === IDENTITY_KEY;

// ── Key derivation (pure circuits) ─────────────────────────────────────────

/** `accountId = persistentHash(SK)`: the public identity of a CFT account. */
export const accountIdFromSecretKey = (sk: Uint8Array): Uint8Array => pureCircuits.computeAccountId(sk);

/** The ElGamal public key registered on chain for an encryption secret EK. */
export const derivePk = (ek: Uint8Array): JubjubPoint => pureCircuits.derivePk(ek);

/**
 * `secretToScalar(EK)`: the Jubjub scalar behind an encryption secret. It
 * decrypts memos and opens balance ciphertexts but cannot spend, which makes
 * it a shareable "viewing key". Hex-encoded as 32 bytes in the wallet API.
 */
export const viewingScalar = (ek: Uint8Array): bigint => pureCircuits.viewingScalar(ek);

export const scalarToHex = (s: bigint): string => s.toString(16).padStart(64, '0');
export const hexToScalar = (hex: string): bigint => {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{1,64}$/.test(clean)) throw new Error('viewing key must be up to 32 bytes of hex');
  return BigInt(`0x${clean}`);
};

/** Decrypt a credit memo with a viewing scalar: the exact delivered amount. */
export const decryptMemo = (memo: EcdhMask_Ciphertext, s: bigint): bigint => pureCircuits.decryptMemo(memo, s);

/** Decrypt an exponential-ElGamal ciphertext to the lifted point g^value. */
export const decryptToPoint = (ct: ElGamal_Ciphertext, s: bigint): JubjubPoint => pureCircuits.decryptToPoint(ct, s);

/** g^value: what a balance ciphertext decrypts to. */
export const valuePoint = (value: bigint): JubjubPoint => pureCircuits.valuePoint(value);

export const addCiphertexts = (a: ElGamal_Ciphertext, b: ElGamal_Ciphertext): ElGamal_Ciphertext =>
  pureCircuits.addCiphertexts(a, b);

/** True iff `ct` encrypts exactly `claimed` under the key behind scalar `s`. */
export const verifyBalance = (ct: ElGamal_Ciphertext, s: bigint, claimed: bigint): boolean =>
  pointKey(decryptToPoint(ct, s)) === pointKey(valuePoint(claimed));

// ── Bounded discrete log (baby-step giant-step) ────────────────────────────
//
// Balances are stored as lifted ElGamal (g^value). A holder normally knows its
// plaintext from the memo channel and its own debits, but a wallet that lost
// its cache, or a viewer holding only the viewing key, recovers the value by a
// bounded search. The memo channel carries exact amounts without any bound;
// the bound below only applies to the accumulated balance ciphertext.

type NoblePoint = InstanceType<typeof jubjub.Point>;

const toNoble = (p: JubjubPoint): NoblePoint => jubjub.Point.fromAffine({ x: p.x, y: p.y });
const nobleKey = (p: NoblePoint): string => {
  const a = p.toAffine();
  return `${a.x.toString(16)}:${a.y.toString(16)}`;
};

export class DiscreteLog {
  private table: Map<string, number> | undefined;
  private negGiant: NoblePoint | undefined;

  constructor(private readonly babySteps = 1 << 16) {}

  private ensureTable(): Map<string, number> {
    if (this.table) return this.table;
    const g = toNoble(ecMulGenerator(1n));
    // Guard against a representation mismatch between the two curve libraries.
    if (nobleKey(g.add(g)) !== pointKey(ecMulGenerator(2n))) {
      throw new Error('DiscreteLog: @noble/curves Jubjub disagrees with compact-runtime');
    }
    const table = new Map<string, number>();
    let p = jubjub.Point.ZERO;
    for (let j = 0; j < this.babySteps; j++) {
      table.set(nobleKey(p), j);
      p = p.add(g);
    }
    this.table = table;
    this.negGiant = g.multiply(BigInt(this.babySteps)).negate();
    return table;
  }

  /** Recover `v` from `g^v` for `0 <= v < maxValue`, or `undefined` if out of range. */
  solve(target: JubjubPoint, maxValue: bigint = 1n << 32n): bigint | undefined {
    const table = this.ensureTable();
    const m = BigInt(this.babySteps);
    const giantSteps = Number((maxValue + m - 1n) / m);
    let gamma = toNoble(target);
    for (let i = 0; i < giantSteps; i++) {
      const j = table.get(nobleKey(gamma));
      if (j !== undefined) return BigInt(i) * m + BigInt(j);
      gamma = gamma.add(this.negGiant!);
    }
    return undefined;
  }
}

let sharedDlog: DiscreteLog | undefined;
export const discreteLog = (): DiscreteLog => (sharedDlog ??= new DiscreteLog());

/** Recover the plaintext of `ct` with viewing scalar `s` by bounded search. */
export const recoverBalance = (ct: ElGamal_Ciphertext, s: bigint, maxValue: bigint = 1n << 32n): bigint | undefined => {
  if (isZeroCiphertext(ct)) return 0n;
  return discreteLog().solve(decryptToPoint(ct, s), maxValue);
};
