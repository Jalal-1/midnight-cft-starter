// Witnesses and private state for the CFT.
//
// The OZ module's witness contract (see the header of
// @openzeppelin/compact-contracts/token/ConfidentialFungibleToken.compact):
//
//   wit_ConfidentialTokenSK  account secret; accountId = persistentHash(SK)
//   wit_ConfidentialTokenEK  ElGamal secret (the viewing key)
//   wit_PlaintextBalance(ct) the wallet's cached plaintext for `ct`
//   wit_RandomnessSeed       32 fresh, secret bytes per invocation
//   wit_OwnableSK            issuer identity (we reuse SK, so the issuer's
//                            Ownable id equals its CFT accountId)
//
// Private state is plain JSON (hex / decimal strings) so any private-state
// provider can persist, export and import it.
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { ElGamal_Ciphertext, Ledger, Witnesses } from './managed/cft/contract/index.js';
import { accountIdFromSecretKey, ctKey, fromHex, isZeroCiphertext, randomBytes32, scalarToHex, toHex, verifyBalance, viewingScalar } from './crypto.js';

export type CftPrivateState = {
  /** 32-byte account secret (hex). Identity for the CFT and, for the issuer, Ownable. */
  readonly secretKeyHex: string;
  /** 32-byte ElGamal secret (hex): decrypts, cannot spend. */
  readonly encryptionKeyHex: string;
  /** Seed for the current invocation's randomness. Rotated before every transaction. */
  readonly randomnessSeedHex?: string;
  /** ciphertext key -> plaintext (decimal string). */
  readonly plaintextCache: Record<string, string>;
  /**
   * Spendable plaintexts we expect after our own recent debits / sweeps, not
   * yet matched to a ciphertext (the indexer may lag). Verified against the
   * ciphertext on the next sync, so a wallet never needs discrete log for its
   * own moves.
   */
  readonly spendableCandidates?: string[];
};

export const CftPrivateState = {
  generate: (): CftPrivateState => ({
    secretKeyHex: toHex(randomBytes32()),
    encryptionKeyHex: toHex(randomBytes32()),
    plaintextCache: {},
  }),

  fromSecrets: (secretKeyHex: string, encryptionKeyHex: string): CftPrivateState => ({
    secretKeyHex,
    encryptionKeyHex,
    plaintextCache: {},
  }),

  /** Fresh 32-byte CSPRNG seed. Call before every transaction (freshness is load-bearing for confidentiality). */
  withFreshSeed: (s: CftPrivateState): CftPrivateState => ({
    ...s,
    randomnessSeedHex: toHex(randomBytes32()),
  }),

  cachePlaintext: (s: CftPrivateState, ct: ElGamal_Ciphertext, value: bigint): CftPrivateState => ({
    ...s,
    plaintextCache: { ...s.plaintextCache, [ctKey(ct)]: value.toString() },
  }),

  lookupPlaintext: (s: CftPrivateState, ct: ElGamal_Ciphertext): bigint | undefined => {
    if (isZeroCiphertext(ct)) return 0n;
    const v = s.plaintextCache[ctKey(ct)];
    return v === undefined ? undefined : BigInt(v);
  },

  /** Remember an expected spendable value (bounded list, newest first). */
  withSpendableCandidate: (s: CftPrivateState, value: bigint): CftPrivateState => ({
    ...s,
    spendableCandidates: [
      value.toString(),
      ...(s.spendableCandidates ?? []).filter((v) => v !== value.toString()),
    ].slice(0, 16),
  }),

  /** Our own accountId (hex). */
  accountIdHex: (s: CftPrivateState): string => toHex(accountIdFromSecretKey(fromHex(s.secretKeyHex))),

  /** Our own viewing scalar (hex). */
  viewingKeyHex: (s: CftPrivateState): string => scalarToHex(viewingScalar(fromHex(s.encryptionKeyHex))),
};

type Ctx = WitnessContext<Ledger, CftPrivateState>;

export const witnesses: Witnesses<CftPrivateState> = {
  wit_ConfidentialTokenSK({ privateState }: Ctx): [CftPrivateState, Uint8Array] {
    return [privateState, fromHex(privateState.secretKeyHex)];
  },

  wit_ConfidentialTokenEK({ privateState }: Ctx): [CftPrivateState, Uint8Array] {
    return [privateState, fromHex(privateState.encryptionKeyHex)];
  },

  wit_OwnableSK({ privateState }: Ctx): [CftPrivateState, Uint8Array] {
    return [privateState, fromHex(privateState.secretKeyHex)];
  },

  wit_PlaintextBalance({ privateState }: Ctx, ct: ElGamal_Ciphertext): [CftPrivateState, bigint] {
    const cached = CftPrivateState.lookupPlaintext(privateState, ct);
    if (cached !== undefined) return [privateState, cached];
    // Not cached: the ciphertext may be one this wallet just produced itself
    // (e.g. the second transfer of a batch sees the balance left by the first).
    // Try the values the wallet expects after its own moves, verified against
    // the ciphertext before use, and remember the match.
    const scalar = viewingScalar(fromHex(privateState.encryptionKeyHex));
    for (const candidate of privateState.spendableCandidates ?? []) {
      const v = BigInt(candidate);
      if (verifyBalance(ct, scalar, v)) return [CftPrivateState.cachePlaintext(privateState, ct, v), v];
    }
    throw new Error(
      'wit_PlaintextBalance: no known plaintext for the current balance ciphertext. ' +
        'Sync the account first so the wallet knows its spendable balance.',
    );
  },

  wit_RandomnessSeed({ privateState }: Ctx): [CftPrivateState, Uint8Array] {
    // Seed freshness is load-bearing for confidentiality (see the module
    // header): a reused seed leaks plaintext differences. Hand out a fresh
    // CSPRNG seed on every call and thread it through the returned state, so
    // consecutive calls in one batched transaction never share randomness.
    // (A circuit that must re-derive the same randomness twice within one
    // invocation, such as OZ's `approve` refund path, would instead need the
    // seed held fixed for that invocation; this template does not export it.)
    const fresh = CftPrivateState.withFreshSeed(privateState);
    return [fresh, fromHex(fresh.randomnessSeedHex!)];
  },
};
