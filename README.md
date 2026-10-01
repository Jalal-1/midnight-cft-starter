# Midnight Starter

**Live demo:** https://jalal-1.github.io/midnight-cft-starter/ · **Source:** https://github.com/Jalal-1/midnight-cft-starter

A forkable starter template for building dApps on the [Midnight](https://midnight.network) network.
It ships a deployable **ConfidentialFungibleToken** (OpenZeppelin Contracts for Compact), a
browser frontend that connects to the [1AM](https://1am.xyz) wallet and deploys / uses the token,
and a headless CLI for seed-based deployments and end-to-end checks.

## What's in the box

| Phase | What                                                                                  | Status |
| ----- | ------------------------------------------------------------------------------------- | ------ |
| 1     | Frontend: landing page + Connect Wallet via DApp Connector v4 (1AM, any v4 wallet)    | ✅     |
| 2     | Contract: OpenZeppelin CFT wrapper in Compact, compiled with the Compact 0.31.1 toolchain | ✅  |
| 3     | Deploy: from the browser through the wallet, or headless from a seed; local devnet via Docker | ✅ |

```
apps/web/                 Vite + React 19 + TypeScript + Tailwind v4
  src/midnight/
    networks.ts           network ids, labels, indexer / proof-server endpoints
    wallet.ts             1AM discovery (window.midnight), error mapping, formatting helpers
    WalletProvider.tsx    React context: detect → connect (follows the wallet's network) → connected; auto-reconnect
    providers.ts          Midnight.js providers on top of the connected wallet
    CftProvider.tsx       React context: tokens per network, deploy / join / register / issue / send / sweep / burn
    glossary.ts           field explanations taken from the OpenZeppelin module's documentation
  src/components/         Header, ConnectScreen, TokensPanel, TokenDetails, AccountCard, ActionsPanel, Glossary
packages/contract/        The contract and its TypeScript SDK (@midnight-starter/contract)
  src/cft.compact         wrapper around OpenZeppelin ConfidentialFungibleToken + PublicSupply + Ownable
  src/witnesses.ts        private state (SK / EK / plaintext cache) and the OZ witnesses
  src/crypto.ts           key derivation, memo decryption, balance verification, bounded discrete log
  src/ledger.ts           read token / account out of the public ledger, resolve encrypted balances
  src/client.ts           CftClient: deploy / join and every token operation on Midnight.js providers
  src/managed/cft/        compiler output (gitignored): TS module, prover / verifier keys, ZKIR
packages/deploy/          Headless CLI (@midnight-starter/deploy): deploy.ts, e2e.ts, seed wallet
docker/                   standalone devnet (node + indexer + proof server) and proof-server-only compose files
.compact-version          0.31.1 (the compiler version the networks support today)
```

## Prerequisites

- Node.js 22+ (see `.nvmrc`) and [pnpm](https://pnpm.io) 11+ (`corepack enable`)
- The Compact developer tools, pinned to **0.31.1**:
  ```bash
  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  compact update 0.31.1
  compact compile --version   # 0.31.1
  ```
- Docker Compose v2 for the local devnet and/or a local proof server
- A Midnight wallet extension implementing DApp Connector v4. This template is built around
  [1AM](https://1am.xyz) ([Chrome Web Store](https://chromewebstore.google.com/detail/1am/bphnkdkcnfhompoegfpgnkidcjfbojjp)); Lace also shows up in the picker.

## Quick start

```bash
pnpm install
pnpm compile          # compact compile → packages/contract/src/managed/cft (≈1 min, 48 MB of keys)
pnpm build:contract   # TypeScript SDK → packages/contract/dist
pnpm dev              # http://localhost:5173
```

In the browser: **Connect 1AM** (the app follows whichever network the wallet is on), then **+ Deploy**
a token (you become the issuer) or **Join** one by contract address. Select it in **Your tokens**, then
**Register** your confidential account, **Issue** to a registered account (issuer), **Sweep**, **Send
confidentially**, **Burn**. Every field has a "?" with the explanation from the contract's own
documentation, and the **Glossary** button collects them all.

The dashboard is a fixed, app-like view (panels scroll, the page does not). The connection, the
network, your tokens per network and your confidential identity per wallet all survive a reload.

`pnpm compile:fast` skips proving-key generation (type-checking the contract only); the app needs the
full `pnpm compile` to prove transactions.

## Networks

There is no network selector in the UI: the network is chosen in 1AM. On connect the app asks for the
last network it saw (or `VITE_DEFAULT_NETWORK_ID`, default `preview`), reads back the network the wallet
is actually on, reconnects on that one and shows it in the top bar. If you switch networks inside the
wallet, the app follows within a few seconds. Tokens and accounts are remembered per network.

| Network    | Connector `networkId` | Indexer                                   | Notes                                           |
| ---------- | --------------------- | ----------------------------------------- | ----------------------------------------------- |
| Preview    | `preview`             | indexer.preview.midnight.network          | Public dev network.                             |
| Preprod    | `preprod`             | indexer.preprod.midnight.network          | Public staging network.                         |
| Undeployed | `undeployed`          | 127.0.0.1:8088 (`pnpm devnet:up`)         | Local devnet. Wallet must be configured for it. |
| Mainnet    | `mainnet`             | indexer.mainnet.midnight.network          | Real funds.                                     |

Endpoints live in `apps/web/src/midnight/networks.ts` and `packages/deploy/src/config.ts`.

## The contract

`packages/contract/src/cft.compact` composes three OpenZeppelin modules (installed from npm as
`@openzeppelin/compact-contracts@0.3.0-rc.1`, the last line targeting the ledger-8 / Compact 0.31
stack the public networks run):

- **ConfidentialFungibleToken** — balances are ElGamal ciphertexts on Jubjub; every credit delivers the
  amount to the recipient through an ECDH one-time-pad memo; accounts are `accountId = hash(SK)`.
- **ConfidentialFungibleTokenPublicSupply** — a public `totalSupply` (mint / burn amounts are visible as deltas).
- **Ownable** — the deployer's account is the issuer and the only one that can `mint`.

Exported impure circuits: `register`, `sweep`, `transfer(to, value)`, `burn(value)`, `mint(account, value)`.
Each exported circuit adds ~2.6 KB of verifier key to the deploy transaction against a ~50 KB per-tx
write budget on public networks, so the surface is deliberately lean. Allowances (`approve`,
`transferFrom`), `Pausable`, freeze lists etc. are one `export circuit` away in the same file.

What is public: the (sender, recipient) pair of every transfer, every account id, the supply.
What is hidden: every balance and every transfer amount.

### CFT accounts vs wallet accounts

A CFT account is a keypair the **dApp** generates (`CftPrivateState.generate()`), independent of the
wallet's own keys. The wallet only pays fees. The browser keeps one identity per wallet address in
`localStorage` (SK / EK) and the full private state (plaintext cache, randomness seed) in an
encrypted IndexedDB store via Midnight.js's level private-state provider. Losing both means losing
the ability to spend that account's balance, exactly like losing a wallet seed. For anything beyond a
starter, back this up or derive it from the wallet (e.g. `signData`).

## Headless deploy and end-to-end check

```bash
pnpm devnet:up                 # node 1.0.2 + indexer 4.3.5 + proof server 8.1.0, genesis wallet funded
pnpm e2e                       # deploy, register ×3, mint, sweep, confidential transfer, burn
pnpm deploy:contract           # just deploy; prints the contract address
pnpm devnet:down
```

Against a public network, fund a seed (faucet: https://faucet.preview.midnight.network/) and run a
local proof server for the CLI (`pnpm proof-server:up`):

```bash
SEED=<64 hex chars> pnpm deploy:contract -- --network preview --name "Confidential Dollar" --symbol cUSD --decimals 2
SEED=<64 hex chars> pnpm e2e -- --network preview
```

The issuer identity is written to `packages/deploy/.state/<network>/issuer.json` (gitignored, keep it
secret) and reused on the next deploy; addresses are appended to `deployments.txt` next to it.

## Benchmark: how many balance updates fit in one block?

`pnpm bench` measures per-block concurrency on a real network (the local devnet by default). It deploys
a fresh token, gives every sender its own funded fee wallet (like real users), builds and proves N
transfers against the same chain state, submits them all in the same instant, then reads back from the
indexer which block included each one and whether it succeeded.

```bash
pnpm devnet:up
pnpm bench -- --mode disjoint --senders 10   # 10 users → 10 other users, independently
pnpm bench -- --mode fanin    --senders 4    # 4 users → the same recipient
pnpm bench -- --mode fanout   --senders 4    # 1 user → 4 recipients, 4 separate transactions at once
pnpm bench -- --mode batch    --senders 10   # 1 treasury → 10 recipients in ONE transaction
```

Three things bound the answer, and the benchmark separates them:

- **Fees (DUST).** Every transaction pays its fee in DUST, and a wallet holds its DUST as one coin per
  registered NIGHT UTXO. A coin is spent and re-created per transaction, so a wallet with one coin pays
  for one transaction per block. The benchmark therefore funds one wallet per sending user, and gives
  the fan-out sender N NIGHT UTXOs so it holds N DUST coins. A transaction the node rejects still leaves
  its DUST coin pending in the wallet; call `revertTransaction` before retrying, or the retry fails with
  "could not balance dust".
- **Execution-cost budget.** A transaction declares the cost of replaying its transcript, measured
  against the state it was built on; the DUST fee covers that budget. When another transaction in the
  same block has grown the same ledger map first, replaying costs more than declared and the node
  rejects it at pre-dispatch. The node's internal name for this is `Transcript(Execution(OutOfGas))`.
  Ten simultaneous `register` calls (ten inserts into the same maps) got two through per block for
  this reason.
- **Contract state.** From the module's own "Concurrency" notes: a transfer reads and writes the
  sender's balance and the recipient's pending pool, memo list and credit counter, so transfers between
  **disjoint** pairs touch different ledger cells, while two credits to the **same** recipient (or two
  debits from the **same** sender) in one block conflict and only the first succeeds, unless they are
  chained inside one transaction (see the treasury batch below). Mint and burn also touch the public
  `totalSupply`.

Operational note for the local stack: the indexer image (4.3.5) crash-loops when a dozen wallets sync
at once, so the benchmark keeps at most two wallets live (the funder and the sender currently
building or balancing) and relays all finalized transactions through the funder's connection.

The benchmark prints the per-block histogram with each transaction's status and fee, the proving and
balancing times, and verifies the ledger afterwards.

Measured on the local devnet (node 1.0.2, indexer 4.3.5, proof server 8.1.0, ~6 s blocks):

| Scenario                                   | Result                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 10 users → 10 other users, independently   | all 10 transfers in the same block (one block after submit), 10/10 succeeded: 20 balance updates in one block |
| 4 users → the same recipient               | 1 succeeded; 3 included but `FailFallible` (fee paid, no state change): one credit per recipient per block |
| 1 user → 4 recipients, 4 separate transactions | wallet (4 registered NIGHT UTXOs) could pay for 2 of 4; of those, 1 succeeded and 1 `FailFallible`: one debit per sender per block |
| 1 treasury → 10 recipients, one transaction | `SucceedEntirely`: 10 chained transfer calls as segments 1..10, all 10 recipients credited in one block, one DUST fee, ~53 s end to end |
| 10 simultaneous `register` calls           | 2 accepted per block; the rest rejected at pre-dispatch (execution-cost budget exceeded, `OutOfGas`) and must be rebuilt |

So a sender cannot fan out with *separate* transactions: it has no way to order them inside a block
(Midnight has no account nonces), and every one after the first sees a balance that has already
changed. What a treasury does instead is put the whole fan-out into **one transaction**:
`CftClient.transferBatch` builds each transfer against the state the previous one leaves behind and
places the calls as segments 1..N; the ledger executes a transaction's segments in ascending segment
id, so the chain is deterministic, and one DUST fee pays for all of it. (Midnight.js's own scoped
transactions give each call a random segment id, which is why the first attempt at this succeeded for
one call only.) Per transfer on this machine: build ~1 s, prove ~6 s, balance <1 s. The ceiling for independent pairs
was not reached at 10; raise `--senders` to look for it (each extra sender adds about four setup
transactions, roughly 100 s).

## How the pieces fit

1. **Wallet connection** (`WalletProvider.tsx`): find 1AM under `window.midnight`, `connect()` with the
   last known network, follow the network the wallet reports, read addresses and the shielded public
   keys Midnight.js needs. The connection is restored on reload until you disconnect.
2. **Providers** (`providers.ts`): proofs are delegated to the wallet when it exposes
   `getProvingProvider` (1AM proves in-wallet; no proof server needed), otherwise sent to an HTTP
   proof server. Transactions are balanced, signed and submitted by the wallet via
   `balanceUnsealedTransaction` / `submitTransaction`. ZK assets are served by the app at
   `/contract/cft/{keys,zkir}` (copied from the compiled contract at build time).
3. **Contract client** (`client.ts`): `deployCft` / `joinCft` wrap Midnight.js's `deployContract` /
   `findDeployedContract`; `CftClient` rotates the randomness seed before every transaction and keeps
   the plaintext cache the OZ witnesses require.

## Hosting

The web app is a static site: proving happens inside 1AM and chain state is read from the public
indexer, so no server is needed. `.github/workflows/deploy-pages.yml` builds everything (installing the
pinned Compact toolchain and caching the compiled contract) and publishes `apps/web/dist` to **GitHub
Pages** on every push to `main`. Turn it on once under Settings → Pages → Source: *GitHub Actions*.
The reference deployment is https://jalal-1.github.io/midnight-cft-starter/. After forking, the same
workflow publishes your fork at `https://<you>.github.io/<repo>/` with no changes.

Any other static host works the same way: run `pnpm compile && pnpm build` and upload `apps/web/dist`
(about 60 MB, mostly proving keys; the largest file is 22 MB). When the site is served under a sub-path,
build with `VITE_BASE=/that-path/`.

## Scripts

| Command               | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm compile`        | Compile the contract with proving keys (needs `compact` 0.31.1)  |
| `pnpm compile:fast`   | Compile without proving keys (type-check the Compact only)       |
| `pnpm build:contract` | Build the TypeScript SDK and copy the compiled assets            |
| `pnpm dev`            | Start the Vite dev server                                        |
| `pnpm build`          | Build the SDK and the web app                                    |
| `pnpm typecheck`      | Type-check every workspace                                       |
| `pnpm devnet:up/down` | Start / stop the local devnet                                    |
| `pnpm deploy:contract`, `pnpm e2e` | Headless deploy / end-to-end check (`-- --network <name>`)   |
| `pnpm bench`          | Per-block concurrency benchmark (`-- --mode disjoint\|fanin\|fanout --senders N`) |

## Troubleshooting

- **"No Midnight wallet detected"** — install the extension, then refresh the page.
- **"1AM is on network X, which this app does not know"** — the wallet reports a network id this template
  has no endpoints for; add it to `apps/web/src/midnight/networks.ts`.
- **`checkRuntimeVersion` / version mismatch at load** — the compiler, `compact-runtime`, `ledger-v8` and
  the network must agree. This template pins compiler 0.31.1 ↔ runtime 0.16.0 ↔ ledger 8.1.0 (see
  `pnpm-workspace.yaml` overrides and https://docs.midnight.network/relnotes/support-matrix). Do not
  `compact update` past 0.31.1 until the networks move.
- **"Transaction would exhaust the block limits" on deploy** — too many exported circuits for the
  network's per-transaction write budget; export fewer.
- **Indexer exits on `pnpm devnet:up`** — it raced the node's first block; it restarts on failure, give it a few seconds.
- **First proof is slow** — 1AM proves in-browser with WASM and fetches the prover key (up to 21 MB per
  circuit) on first use. Show a loading state; the UI already does.
- **Spendable balance "unknown"** — this browser has no record of the balance and it is above the
  recovery bound; enter the balance you know in the account panel, it is verified against the ciphertext.

## License

Apache-2.0. OpenZeppelin Contracts for Compact is MIT-licensed.
