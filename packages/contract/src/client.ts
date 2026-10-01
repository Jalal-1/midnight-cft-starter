// Midnight.js wiring shared by the browser and the CLI: the compiled contract,
// deploy / join, and a `CftClient` that keeps the confidential-token
// bookkeeping (seed rotation, plaintext cache, memo replay) next to every
// circuit call. Callers only have to supply `MidnightProviders`.
import { CompiledContract, type ProvableCircuitId } from '@midnight-ntwrk/compact-js';
import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { FinalizedTxData, MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import * as Cft from './managed/cft/contract/index.js';
import { accountIdFromSecretKey, fromHex, hexToScalar, normalizeAccountId, toHex, verifyBalance } from './crypto.js';
import {
  isIssuer,
  memoHistory,
  readAccount,
  readToken,
  resolvePending,
  resolveSpendable,
  type AccountView,
  type BalanceSource,
  type TokenInfo,
} from './ledger.js';
import { CftPrivateState, witnesses } from './witnesses.js';

export { Cft };
export type Ledger = Cft.Ledger;
export type CftContract = Cft.Contract<CftPrivateState>;
export type CftCircuitId = ProvableCircuitId<CftContract>;

/** Key under which the private state (SK / EK / cache) is stored by the private-state provider. */
export const PRIVATE_STATE_ID = 'midnightStarterCft';
export type CftProviders = MidnightProviders<CftCircuitId, typeof PRIVATE_STATE_ID, CftPrivateState>;
export type CftCompiledContract = ReturnType<typeof makeCompiledContract>;
export type DeployedCft = DeployedContract<CftContract> | FoundContract<CftContract>;

/**
 * @param zkAssetsPath where the compiled `managed/cft` output lives: a directory
 * on disk for Node, or a URL path served by the web app in the browser.
 */
export const makeCompiledContract = (zkAssetsPath: string) =>
  CompiledContract.make<CftContract>('Cft', Cft.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkAssetsPath),
  );

export interface TokenParams {
  name: string;
  symbol: string;
  decimals: number;
}

/** Deploy a new token. The identity in `issuer` becomes the Ownable owner (the only account allowed to mint). */
export const deployCft = (
  providers: CftProviders,
  compiledContract: CftCompiledContract,
  issuer: CftPrivateState,
  token: TokenParams,
): Promise<DeployedContract<CftContract>> =>
  deployContract(providers, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: issuer,
    args: [token.name, token.symbol, BigInt(token.decimals), accountIdFromSecretKey(fromHex(issuer.secretKeyHex))],
  });

/**
 * Join an existing token WITHOUT clobbering what this provider already knows.
 * Midnight.js overwrites the stored private state whenever `initialPrivateState`
 * is passed together with `privateStateId`, so only pass it on first join.
 */
export const joinCft = async (
  providers: CftProviders,
  compiledContract: CftCompiledContract,
  contractAddress: string,
  identity: CftPrivateState,
): Promise<FoundContract<CftContract>> => {
  const address = contractAddress.trim() as ContractAddress;
  providers.privateStateProvider.setContractAddress(address);
  const stored = await providers.privateStateProvider.get(PRIVATE_STATE_ID);
  if (stored) {
    return findDeployedContract(providers, { contractAddress: address, compiledContract, privateStateId: PRIVATE_STATE_ID });
  }
  return findDeployedContract(providers, {
    contractAddress: address,
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: identity,
  });
};

export interface TxReceipt {
  txId: string;
  blockHeight: number;
}
const receipt = (tx: FinalizedTxData): TxReceipt => ({ txId: tx.txId, blockHeight: Number(tx.blockHeight) });

export interface Balances {
  registered: boolean;
  spendable: bigint | undefined;
  pending: bigint | undefined;
  spendableSource: BalanceSource;
  pendingSource: BalanceSource;
  /** Credit memos decrypted with this account's viewing key, newest first. */
  memos: bigint[];
}

export const UNKNOWN_SPENDABLE =
  'Spendable balance unknown: this wallet has no record of it and it is above the recovery bound. ' +
  'Call setKnownSpendable() with the balance you know; it is verified against the ciphertext before use.';

/**
 * One account's view of one CFT contract.
 *
 * Rules the OZ module imposes on wallets, handled here:
 *  - a fresh CSPRNG seed before every tx (`wit_RandomnessSeed`);
 *  - the plaintext of the current spendable ciphertext must be cached before
 *    any debit (`wit_PlaintextBalance`): we sync first and remember the result.
 */
export class CftClient {
  constructor(
    readonly providers: CftProviders,
    readonly contract: DeployedCft,
    /** The identity this client acts as; kept in sync with the private-state store. */
    readonly identity: CftPrivateState,
  ) {}

  /**
   * Attach to a deployed / found contract. The private-state store is the
   * source of truth: if this provider already used the contract, the stored
   * SK / EK win over `suggested`, so a funded account can never be stranded.
   */
  static async attach(providers: CftProviders, contract: DeployedCft, suggested: CftPrivateState): Promise<CftClient> {
    const stored = await providers.privateStateProvider.get(PRIVATE_STATE_ID);
    return new CftClient(providers, contract, stored ?? suggested);
  }

  get address(): string {
    return this.contract.deployTxData.public.contractAddress;
  }

  get accountId(): string {
    return CftPrivateState.accountIdHex(this.identity);
  }

  /** Shareable viewing key (the scalar, hex): reads memos and balances, cannot spend. */
  get viewingKey(): string {
    return CftPrivateState.viewingKeyHex(this.identity);
  }

  async state(): Promise<CftPrivateState> {
    const s = await this.providers.privateStateProvider.get(PRIVATE_STATE_ID);
    if (!s) throw new Error('private state missing');
    return s;
  }

  async setState(s: CftPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID, s);
  }

  async ledger(): Promise<Ledger> {
    const cs = await this.providers.publicDataProvider.queryContractState(this.address as ContractAddress);
    if (!cs) throw new Error(`contract ${this.address} not found on chain`);
    return Cft.ledger(cs.data);
  }

  async token(): Promise<TokenInfo> {
    return readToken(await this.ledger());
  }

  async isIssuer(): Promise<boolean> {
    return isIssuer(await this.ledger(), this.accountId);
  }

  async view(): Promise<AccountView> {
    return readAccount(await this.ledger(), this.accountId);
  }

  /** Both balances and the memo history. Never throws for an unknown spendable: it is `undefined` with source `'unknown'`. */
  async balances(): Promise<Balances> {
    const view = await this.view();
    let s = await this.state();
    const vk = CftPrivateState.viewingKeyHex(s);
    const memos = view.registered ? memoHistory(view, vk) : [];
    const pending = resolvePending(view, vk);
    const spendable = resolveSpendable(view, vk, s);
    if (view.spendableCt && spendable.value !== undefined) s = CftPrivateState.cachePlaintext(s, view.spendableCt, spendable.value);
    if (view.pendingCt && pending.value !== undefined) s = CftPrivateState.cachePlaintext(s, view.pendingCt, pending.value);
    await this.setState(s);
    return {
      registered: view.registered,
      spendable: spendable.value,
      pending: pending.value,
      spendableSource: spendable.source,
      pendingSource: pending.source,
      memos,
    };
  }

  /** Holder-supplied balance: accepted only if it really is the plaintext of the current spendable ciphertext. */
  async setKnownSpendable(value: bigint): Promise<void> {
    const view = await this.view();
    if (!view.spendableCt) throw new Error('account not registered');
    const s = await this.state();
    if (!verifyBalance(view.spendableCt, hexToScalar(CftPrivateState.viewingKeyHex(s)), value)) {
      throw new Error('that is not the plaintext of your current spendable balance');
    }
    await this.setState(CftPrivateState.cachePlaintext(s, view.spendableCt, value));
  }

  private async rotateSeed(): Promise<void> {
    await this.setState(CftPrivateState.withFreshSeed(await this.state()));
  }

  /** Debits and sweeps need a known spendable; remember what it will become. */
  private async prepareSpend(delta: (b: Balances) => bigint): Promise<Balances> {
    const b = await this.balances();
    if (!b.registered) throw new Error('register first');
    if (b.spendable === undefined) throw new Error(UNKNOWN_SPENDABLE);
    if (b.pending === undefined) throw new Error('pending balance could not be resolved from memos');
    await this.setState(CftPrivateState.withSpendableCandidate(await this.state(), delta(b)));
    await this.rotateSeed();
    return b;
  }

  /** Permissionless: publish this account's encryption key so it can receive tokens. */
  async register(): Promise<TxReceipt> {
    if ((await this.view()).registered) throw new Error('already registered');
    await this.rotateSeed();
    return receipt((await this.contract.callTx.register()).public);
  }

  /** Move pending (incoming) credits into the spendable balance. */
  async sweep(): Promise<TxReceipt> {
    await this.prepareSpend((b) => b.spendable! + b.pending!);
    return receipt((await this.contract.callTx.sweep()).public);
  }

  /** Confidential transfer: the amount is hidden, (sender, recipient) are public. */
  async transfer(toAccountId: string, value: bigint): Promise<TxReceipt> {
    const to = normalizeAccountId(toAccountId);
    const b = await this.prepareSpend((b) => b.spendable! - value);
    if (b.spendable! < value) throw new Error('insufficient spendable balance (sweep pending credits first?)');
    return receipt((await this.contract.callTx.transfer(fromHex(to), value)).public);
  }

  /** Burn from this account's spendable balance; totalSupply decreases publicly. */
  async burn(value: bigint): Promise<TxReceipt> {
    const b = await this.prepareSpend((b) => b.spendable! - value);
    if (b.spendable! < value) throw new Error('insufficient spendable balance (sweep pending credits first?)');
    return receipt((await this.contract.callTx.burn(value)).public);
  }

  /** Issuer only. Mints to a registered account; totalSupply increases publicly. */
  async mint(toAccountId: string, value: bigint): Promise<TxReceipt> {
    const to = normalizeAccountId(toAccountId);
    await this.rotateSeed();
    return receipt((await this.contract.callTx.mint(fromHex(to), value)).public);
  }
}

export const accountIdOf = (s: CftPrivateState): string => toHex(accountIdFromSecretKey(fromHex(s.secretKeyHex)));
