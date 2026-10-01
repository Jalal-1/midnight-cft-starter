# @midnight-starter/contract — the CFT bundle

Everything needed to put a confidential fungible token on Midnight, in one package:

| Part | File(s) | What it is |
| --- | --- | --- |
| Contract | `src/cft.compact` | A thin Compact wrapper over OpenZeppelin's `ConfidentialFungibleToken`, `ConfidentialFungibleTokenPublicSupply` and `Ownable` (from `@openzeppelin/compact-contracts` 0.3.0-rc.1). |
| Compiled output | `src/managed/cft/` (gitignored, produced by `pnpm compact`) | Generated TypeScript module, prover and verifier keys (~48 MB), ZKIR. Served by the web app, read from disk by the CLI. |
| SDK | `src/client.ts`, `src/witnesses.ts`, `src/crypto.ts`, `src/ledger.ts` | Deploy / join, every token operation, the witnesses the module requires, and the wallet-side cryptography to read encrypted balances. |

## Circuits

| Circuit | Who | Effect | Public on chain |
| --- | --- | --- | --- |
| `register()` | anyone | publishes the caller's encryption key; required before receiving | the Account ID |
| `mint(account, value)` | issuer only | credits a registered account, raises `totalSupply` | the amount (supply delta), recipient |
| `sweep()` | holder | moves pending credits into the spendable balance | nothing new |
| `transfer(to, value)` | holder | debits sender, credits recipient's pending pool, leaves an encrypted memo | (sender, recipient) pair |
| `burn(value)` | holder | debits the caller, lowers `totalSupply` | the amount (supply delta) |

Balances and transfer amounts are never visible. Pure helpers (`computeAccountId`, `derivePk`, `viewingScalar`, `decryptMemo`, `decryptToPoint`, `valuePoint`, `addCiphertexts`) run locally with no proof.

## SDK

```ts
import { CftClient, CftPrivateState, deployCft, joinCft, makeCompiledContract, parseAmount } from '@midnight-starter/contract';

const compiled = makeCompiledContract(zkAssetsPath);      // dir on disk (Node) or URL path (browser)
const identity = CftPrivateState.generate();              // SK + EK; keep it, it IS the account

// issuer
const deployed = await deployCft(providers, compiled, identity, { name: 'My Token', symbol: 'MTK', decimals: 2 });
const issuer = new CftClient(providers, deployed, identity, compiled);
await issuer.register();
await issuer.mint(holderAccountId, parseAmount('100.00', 2));
await issuer.transferBatch(recipients.map((to) => ({ to, value: parseAmount('1.00', 2) }))); // one tx, one block

// holder
const found = await joinCft(providers, compiled, deployed.deployTxData.public.contractAddress, identity);
const holder = await CftClient.attach(providers, found, identity, compiled);
await holder.register();
const { spendable, pending, memos } = await holder.balances();
await holder.sweep();
await holder.transfer(otherAccountId, parseAmount('2.50', 2));
```

`providers` are Midnight.js `MidnightProviders`; see `apps/web/src/midnight/providers.ts` (browser, 1AM wallet) and
`packages/deploy/src/providers.ts` (Node, seed wallet) for the two reference wirings.

## Private state and witnesses

`CftPrivateState` is plain JSON: the account secret `secretKeyHex`, the encryption secret `encryptionKeyHex`, a
plaintext cache keyed by ciphertext, and the expected balances after the wallet's own moves. The four
witnesses the module declares (`wit_ConfidentialTokenSK`, `wit_ConfidentialTokenEK`, `wit_PlaintextBalance`,
`wit_RandomnessSeed`) plus Ownable's `wit_OwnableSK` live in `witnesses.ts`. The randomness seed is fresh
on every call, as the module's confidentiality notes require.

## Scripts

```bash
pnpm compact           # compact compile +0.31.1 src/cft.compact src/managed/cft
pnpm compact:skip-zk   # same without proving keys (type-check the Compact only)
pnpm build             # tsc → dist, plus a copy of src/managed and the .compact source
```

## Extending

Add circuits by exporting more of the OpenZeppelin surface in `cft.compact` (`approve` / `transferFrom`,
`Pausable`, a freeze list). Each exported circuit adds ~2.6 KB of verifier key to the deploy
transaction against a ~50 KB per-transaction write budget on public networks; a deployed contract can
also grow by upgrade through its maintenance authority. Recompile, rebuild, and the generated types
update the SDK.
