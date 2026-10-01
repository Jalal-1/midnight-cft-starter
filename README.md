# Midnight Starter

A forkable starter template for building dApps on the [Midnight](https://midnight.network) network.
Fork it, run it, connect a wallet, then add your own Compact contract and UI.

## Roadmap

| Phase | What                                                                 | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 1     | Frontend: landing page + Connect Wallet via DApp Connector v4 (1AM)  | ✅     |
| 2     | Compact contract in `packages/contract` with compile step            | ⏳     |
| 3     | Deploy flow in `packages/deploy` and contract calls from the frontend | ⏳     |

## Prerequisites

- Node.js 22+ (see `.nvmrc`)
- [pnpm](https://pnpm.io) 11+ (`corepack enable` will pick up the pinned version)
- A Midnight wallet browser extension. This template is built around
  [1AM](https://1am.xyz) ([Chrome Web Store](https://chromewebstore.google.com/detail/1am/bphnkdkcnfhompoegfpgnkidcjfbojjp)),
  but any wallet implementing DApp Connector v4 (e.g. Lace) will show up in the picker.

## Quick start

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173, choose a network in the selector, and click **Connect 1AM**.
Approve the prompt in the extension and the card below shows your address and NIGHT/DUST balances.

Optional: copy `apps/web/.env.example` to `apps/web/.env` to change the network the selector starts on.

### Networks

| Selector     | Connector `networkId` | Notes                                                              |
| ------------ | --------------------- | ------------------------------------------------------------------ |
| Preview      | `preview`             | Public dev network. Recommended default.                           |
| Preprod      | `preprod`             | Public staging network.                                            |
| Undeployed   | `undeployed`          | Local devnet. Needs node + indexer + proof server, and a wallet configured for it. |
| Mainnet      | `mainnet`             | Real funds.                                                        |

The wallet must be on the same network you select, otherwise the connect step fails with a clear message.

## Project layout

```
apps/web/                 Vite + React 19 + TypeScript + Tailwind v4
  src/midnight/
    networks.ts           network ids, labels, cautions, env default
    wallet.ts             discovery (window.midnight), error mapping, formatting helpers
    WalletProvider.tsx    React context: detect → connect → connected state machine
    useWallet.ts          hook
  src/components/         NetworkSelect, ConnectWalletButton, WalletCard, Hero
packages/                 reserved for contract/ and deploy/ (phases 2–3)
```

## How the wallet connection works

Wallets implementing [DApp Connector v4](https://docs.midnight.network/api-reference/dapp-connector)
inject an `InitialAPI` under `window.midnight[<key>]`. 1AM uses the key `1am`.
The provider:

1. Polls `window.midnight` briefly on mount (extensions can inject slightly after React mounts).
2. Calls `wallet.connect(networkId)` and gets a `ConnectedAPI`.
3. Verifies `getConnectionStatus()` reports the network you selected.
4. Reads `getUnshieldedAddress()`, then `getUnshieldedBalances()` and `getDustBalance()` best-effort.
5. Polls `getConnectionStatus()` every 5 s while connected, since v4 has no events.

"Disconnect" simply drops the `ConnectedAPI` reference; v4 has no wallet-side disconnect.

## Scripts

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Start the Vite dev server                 |
| `pnpm build`      | Type-check and build `apps/web` to `dist` |
| `pnpm preview`    | Serve the production build locally        |
| `pnpm typecheck`  | Type-check every workspace                |

## Troubleshooting

- **"No Midnight wallet detected"** — install the extension, then refresh the page. Extensions inject
  `window.midnight` on page load, so a tab opened before installation won't see it.
- **Network mismatch error** — switch the network inside the wallet, or change the selector, and reconnect.
- **Connect prompt never appears** — unlock the wallet and make sure it has finished syncing.
- **First proof is slow** (later phases) — 1AM proves in-browser with WASM; the first proof after a cold start
  can take a while. Show a loading state.

## Where to go next

- Add a Compact contract under `packages/contract` and compile it with `compactc`.
- Use `api.getConfiguration()` from the connected wallet to pick indexer/node URIs the user prefers.
- Use `api.getProvingProvider()` and `api.balanceUnsealedTransaction()` to prove, balance and submit contract calls.

## License

Apache-2.0
