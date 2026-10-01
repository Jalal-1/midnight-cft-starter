# Midnight CFT Starter

Deploy OpenZeppelin's **ConfidentialFungibleToken** (CFT) on [Midnight](https://midnight.network) and use
it from a web app. Balances and transfer amounts stay encrypted on chain; who holds an account and who
pays whom is public.

**Live demo:** https://jalal-1.github.io/midnight-cft-starter/ · **Source:** https://github.com/Jalal-1/midnight-cft-starter

```
packages/contract   the CFT bundle: Compact contract + compiled keys + TypeScript SDK
apps/web            React app: connect 1AM, deploy or join a token, register, issue, send, sweep, burn
packages/deploy     headless CLI: seed-based deploy, end-to-end check, concurrency benchmark
docker/             local devnet (node, indexer, proof server) and a standalone proof server
```

## The CFT bundle

`packages/contract` is what you take into your own solution. It has three parts.

**The contract** (`src/cft.compact`) composes three audited OpenZeppelin modules from
`@openzeppelin/compact-contracts` 0.3.0-rc.1 and exports a deliberately small surface:

| Circuit | Who | Effect | What becomes public |
| --- | --- | --- | --- |
| `register()` | anyone | publishes the caller's encryption key; required before receiving | the Account ID |
| `mint(account, value)` | issuer only | credits a registered account, raises `totalSupply` | amount (via supply delta), recipient |
| `sweep()` | holder | moves pending credits into the spendable balance | nothing new |
| `transfer(to, value)` | holder | debits the sender, credits the recipient, leaves them an encrypted memo | (sender, recipient) pair |
| `burn(value)` | holder | debits the caller, lowers `totalSupply` | amount (via supply delta) |

The issuer is the Account ID passed at deployment (Ownable owner). Allowances, pausing and freezing
are one `export circuit` away in the same file; see [Extending](#extending).

**The compiled output** (`src/managed/cft/`, produced by `pnpm compile`) is the generated TypeScript
module, the prover and verifier keys (about 48 MB) and the circuit IR. The web app serves it; the CLI
reads it from disk.

**The SDK** (`src/client.ts` and friends) gives you deploy / join, every token operation, the five
witnesses the module requires, and the cryptography to read encrypted balances:

```ts
import { CftClient, CftPrivateState, deployCft, joinCft, makeCompiledContract, parseAmount } from '@midnight-starter/contract';

const compiled = makeCompiledContract(zkAssetsPath);            // directory (Node) or URL path (browser)
const identity = CftPrivateState.generate();                    // the account: keep its two secrets

const deployed = await deployCft(providers, compiled, identity, { name: 'My Token', symbol: 'MTK', decimals: 2 });
const issuer = new CftClient(providers, deployed, identity, compiled);
await issuer.register();
await issuer.mint(holderId, parseAmount('100.00', 2));
await issuer.transferBatch(payees.map((to) => ({ to, value: parseAmount('1.00', 2) })));   // many payees, one block

const holder = await CftClient.attach(providers, await joinCft(providers, compiled, address, holderIdentity), holderIdentity, compiled);
const { spendable, pending, memos } = await holder.balances();
await holder.sweep();
await holder.transfer(otherId, parseAmount('2.50', 2));
```

`providers` are Midnight.js `MidnightProviders`. Two reference wirings are included:
[providers.ts](apps/web/src/midnight/providers.ts) for the browser (fees and proofs through the 1AM
wallet) and [providers.ts](packages/deploy/src/providers.ts) for Node (seed wallet, HTTP proof server).

### How accounts work

A CFT account is a keypair the **application** generates, not the wallet's keys. The wallet only pays
fees. `Account ID = hash(SK)` is public and is what others need to pay you. A second secret derives
the **viewing key**, which decrypts your balances and memos but cannot spend; hand it to an auditor
for read-only access. Incoming credits land in a **pending** pool and are moved into the
**spendable** balance by `sweep()`, which stops third parties from disturbing your spendable
ciphertext with dust. Every credit carries an encrypted memo with the exact amount, so a wallet never
needs to brute-force its own balance. Losing the two secrets loses the account, exactly like a seed.

## Lifecycle, step by step

Every participant goes through the same sequence. Each step is one transaction, paid for and proved by
the participant's wallet (see the next section), and confirmed in the next block (~6 s).

| # | Step | Who | What happens | Prerequisite |
| --- | --- | --- | --- | --- |
| 1 | **Deploy** | the issuer | The constructor stores name, symbol and decimals and records the deployer's Account ID as the only account allowed to mint. | a wallet with DUST |
| 2 | **Register** | every account, issuer included | Publishes the account's encryption public key and sets its balance to an encryption of zero. The module refuses to credit an unregistered account. | the account's secrets exist (the app creates them on first connect) |
| 3 | **Issue** (`mint`) | the issuer | Credits a registered account's *pending* pool and raises the public `totalSupply` by the amount. | recipient has registered and shared its Account ID |
| 4 | **Sweep** | the recipient | Moves everything in *pending* into *spendable* in one proof. Nothing can be spent before this. | pending > 0 |
| 5 | **Send** (`transfer`) | any holder | Debits the sender's spendable balance, credits the recipient's pending pool and leaves them an encrypted memo with the exact amount. | registered sender with enough spendable; registered recipient |
| 6 | **Burn** | any holder | Debits the caller's spendable balance and lowers `totalSupply`. | enough spendable |

Reading a balance never needs a transaction. The SDK decrypts the memo list with the viewing key to
get *pending* exactly, and knows *spendable* from what it debited itself (verified against the
on-chain ciphertext) or, failing that, by a bounded search. If a browser has lost that record, the
holder can type the balance they know and it is verified before use (`setKnownSpendable`).

A treasury that must pay many accounts in one block uses `transferBatch` (step 5, N times, in one
transaction); see [Treasury](#treasury-paying-many-wallets-in-one-block).

## What the wallet does, and what it does not

The 1AM wallet (any DApp Connector v4 wallet) has exactly three jobs in this solution:

1. **Pays.** Every transaction needs a DUST fee. The app hands the wallet an unbalanced transaction;
   the wallet adds the DUST input, signs and submits it (`balanceUnsealedTransaction`,
   `submitTransaction`). The wallet's NIGHT and DUST are the only funds it ever touches.
2. **Proves.** The zero-knowledge proofs for each circuit call are generated inside 1AM
   (`getProvingProvider`), using the prover keys the app serves under `/contract/cft`. The app
   therefore needs no proof server when used with 1AM; the headless CLI uses one because it has no
   wallet.
3. **Anchors identity and network.** The app keeps one CFT account per wallet address, and it uses
   whichever network the wallet is on. Connecting the same wallet again returns you to the same
   account and the same tokens.

The wallet does **not** hold the token. CFT balances are entries inside the contract's state,
encrypted to the account's own key; they do not appear in the wallet's balance view, and the wallet
never sees the account secrets or the viewing key. Those live in the browser: the two secrets in
`localStorage`, the private state (plaintext cache, randomness seed) in an encrypted IndexedDB store,
both scoped to the wallet address. Clearing the browser loses the account even though the wallet seed
is intact. For anything beyond a starter, back the secrets up or derive them deterministically from a
wallet signature (`signData`) so the wallet seed alone can recover them. The same split is what lets
the headless CLI act as issuer or holder with no browser at all.

## Quick start

Prerequisites: Node 22+, pnpm 11+ (`corepack enable`), the Compact toolchain pinned to 0.31.1, and
the [1AM](https://1am.xyz) wallet extension. Docker is needed only for the local devnet or a local
proof server.

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1

pnpm install
pnpm compile            # compiles the contract and generates proving keys (~1 min)
pnpm build:contract     # builds the SDK
pnpm dev                # http://localhost:5173
```

Connect 1AM, click **+ Deploy**, then **Register** your account. Share Account IDs to **Issue** or
**Send**. Every field in the app has a "?" with the explanation from the module's own documentation.

### Toolchain pins

The whole stack must agree on one ledger version. Preview, Preprod and Mainnet run the ledger-8 line:

| Component | Version |
| --- | --- |
| Compact compiler (`.compact-version`) | 0.31.1 |
| `@midnight-ntwrk/compact-runtime` / `compact-js` | 0.16.0 / 2.5.1 |
| `@midnight-ntwrk/ledger-v8` | 8.1.0 |
| `@midnight-ntwrk/midnight-js-*` | 4.1.1 |
| `@openzeppelin/compact-contracts` | 0.3.0-rc.1 |
| Devnet images: node / indexer / proof server | 1.0.2 / 4.3.5 / 8.1.0 |

Overrides live in `pnpm-workspace.yaml`. Newer compilers (0.34+) and OpenZeppelin 0.4.0-alpha target a
ledger the public networks do not run yet. Compatibility matrix:
https://docs.midnight.network/relnotes/support-matrix

## Deploying

**From the browser.** Connect 1AM and deploy; the wallet pays the fee and proves in-wallet, so no
proof server is needed. The app follows whichever network the wallet is on and remembers your
tokens per network.

**Headless.** A funded seed deploys from the CLI (faucet: https://faucet.preview.midnight.network/;
local proof server: `pnpm proof-server:up`):

```bash
SEED=<64 hex> pnpm deploy:contract -- --network preview --name "My Token" --symbol MTK --decimals 2
pnpm devnet:up && pnpm e2e        # local devnet: deploy, register, mint, sweep, transfer, burn
```

The issuer identity is written to `packages/deploy/.state/<network>/issuer.json` (gitignored). Keep
it secret: it is the only identity that can mint.

**Hosting the app.** It is a static site. `.github/workflows/deploy-pages.yml` installs the pinned
toolchain, caches the compiled contract, and publishes `apps/web/dist` to GitHub Pages on every push
to `main` (enable it once under Settings → Pages → Source: GitHub Actions). Any static host works;
build with `VITE_BASE=/sub-path/` when not served from the root.

## Performance and concurrency

Measured on the local devnet (same component versions as Preview, ~6 s blocks). Per transfer: build
~1 s, prove ~6 s on a workstation proof server (1AM proves in-wallet, timings vary), balance under
1 s, inclusion in the next block. Reproduce with `pnpm bench`:

```bash
pnpm devnet:up
pnpm bench -- --mode disjoint --senders 10   # 10 users → 10 other users, independently
pnpm bench -- --mode fanin    --senders 4    # 4 users → the same recipient
pnpm bench -- --mode fanout   --senders 4    # 1 user → 4 recipients, 4 separate transactions
pnpm bench -- --mode batch    --senders 10   # 1 treasury → 10 recipients in ONE transaction
```

| Scenario | Result |
| --- | --- |
| 10 users → 10 other users, independently | all 10 transfers in the same block, 10/10 succeeded: 20 balance updates in one block |
| 4 users → the same recipient | 1 succeeded; 3 included but failed (fee paid, no state change): one credit per recipient per block |
| 1 user → 4 recipients as separate transactions | at most one debit per sender per block; the wallet could pay for 2 of the 4 at all |
| 1 treasury → 10 recipients in one transaction | succeeded entirely: all 10 credited in one block, one fee, ~53 s end to end |
| 10 simultaneous `register` calls | 2 accepted per block; the rest rejected before inclusion and must be rebuilt |

Three things bound these numbers:

- **Fees.** Every transaction pays in DUST, and a wallet holds its DUST as one coin per registered
  NIGHT UTXO. A coin is spent and re-created per transaction, so one coin pays for one transaction per
  block. Independent users have independent wallets; a single wallet gets more by splitting its NIGHT
  into several registered UTXOs. A rejected transaction leaves its coin pending until the wallet
  reverts it.
- **Declared execution cost.** A transaction states the cost of replaying its transcript against the
  state it was built on. If another transaction in the same block has grown the same ledger map first,
  the replay exceeds the declaration and the node rejects it before inclusion (its log says
  `Transcript(Execution(OutOfGas))`). This is what limits simultaneous registrations.
- **Contract state.** A transfer reads and writes the sender's balance and the recipient's pending
  pool, memo list and credit counter. Disjoint pairs touch different cells and share a block freely.
  Two credits to one recipient, or two debits from one sender, conflict and only the first succeeds.

### Treasury: paying many wallets in one block

A sender cannot fan out with separate transactions: Midnight has no account nonces, so it cannot order
them inside a block, and every transfer after the first is proved against a balance that has already
changed. The pattern that works is **one transaction carrying all the transfers**, which is what
`CftClient.transferBatch` does:

1. Build transfer 1 against the on-chain state, transfer 2 against the state transfer 1 leaves
   behind, and so on (`createUnprovenCallTxFromInitialStates`).
2. Place the calls in one transaction as segments 1..N (`Transaction.addIntent({ tag: 'specific', value: k })`).
   The ledger executes a transaction's segments in ascending segment id, so the chain is deterministic.
3. Prove, pay one fee, submit.

Measured: ten transfers from one treasury to ten recipients, included in one block, all credited, one
fee. Midnight.js's scoped transactions chain calls the same way but assign random segment ids, so
dependent calls run in random order; explicit ids are required. Two witness details make this work
and are already in the SDK: the balance witness verifies the wallet's expected value against a
ciphertext it has not yet seen on chain, and the seed witness hands out a fresh seed on every call.

## Extending

- Export more of the OpenZeppelin surface in `cft.compact` (`approve` / `transferFrom`, `Pausable`,
  a freeze list), then `pnpm compile && pnpm build:contract`; the SDK types follow the contract.
- Each exported circuit adds about 2.6 KB of verifier key to the deploy transaction against a ~50 KB
  per-transaction write budget on public networks. A deployed contract can also grow by upgrade
  through its maintenance authority.
- To use the bundle in another repository, copy `packages/contract`, keep the toolchain pins, and
  wire `MidnightProviders` as in the two reference files above.

## Troubleshooting

- **1AM not detected**: install the extension and refresh; it injects on page load.
- **Version mismatch at load (`checkRuntimeVersion`)**: compiler, runtime, ledger and network must
  agree; see the pins above and do not `compact update` past 0.31.1 until the networks move.
- **"Transaction would exhaust the block limits" on deploy**: too many exported circuits; export fewer.
- **Spendable balance unknown**: the browser has no record of it; enter the balance you know in the
  account panel and it is verified against the ciphertext before use.
- **Devnet indexer exits on start**: it raced the node's first block and restarts on its own. It also
  crash-loops when a dozen wallets sync at once, which is why the benchmark keeps two wallets live.

## License

Apache-2.0. OpenZeppelin Contracts for Compact is MIT-licensed.
