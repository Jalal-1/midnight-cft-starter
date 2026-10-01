# @midnight-starter/contract

The Compact contract (`src/cft.compact`) and a TypeScript SDK around its compiled output.

```bash
pnpm compact          # compact compile +0.31.1 src/cft.compact src/managed/cft
pnpm build            # tsc → dist, plus a copy of src/managed and the .compact source
```

Exports:

- `Cft` — the generated contract module (`Contract`, `ledger()`, `pureCircuits`).
- `CftPrivateState`, `witnesses` — private state and the OZ witness implementations.
- `makeCompiledContract(zkAssetsPath)`, `deployCft`, `joinCft`, `CftClient`, `PRIVATE_STATE_ID`.
- `readToken`, `readAccount`, `resolvePending`, `resolveSpendable`, `formatAmount`, `parseAmount`.
- `accountIdFromSecretKey`, `derivePk`, `viewingScalar`, `decryptMemo`, `verifyBalance`, `recoverBalance`, hex helpers.

Consumers supply Midnight.js `MidnightProviders`; see `apps/web/src/midnight/providers.ts` (browser) and
`packages/deploy/src/providers.ts` (Node).
