// Plain-language explanations of every field and action in the UI. The wording
// follows the documentation inside OpenZeppelin's ConfidentialFungibleToken
// module (node_modules/@openzeppelin/compact-contracts/token/ConfidentialFungibleToken.compact)
// and this template's wrapper (packages/contract/src/cft.compact).

export interface GlossaryEntry {
  title: string;
  /** One or two sentences for the tooltip. */
  short: string;
  /** Fuller explanation for the glossary panel. */
  long: string;
}

export const GLOSSARY = {
  accountId: {
    title: 'Account ID',
    short:
      'Your identity in this token: the hash of a secret key this browser generated for your wallet. Share it so people can send you tokens. It is not your wallet address.',
    long:
      'A CFT account is a keypair the dApp generates, separate from your wallet. The module defines accountId = persistentHash(SK), where SK is a 32-byte secret kept in this browser. The Account ID is public: it is the key of the on-chain balance map and appears in every transfer as sender or recipient. Your wallet only pays the fees; it never holds the token.',
  },
  viewingKey: {
    title: 'Viewing key',
    short:
      'Derived from your encryption secret. It decrypts your memos and balances but cannot spend. Give it to an auditor to let them read your account.',
    long:
      'Besides SK, each account has a second 32-byte secret EK. The module derives an ElGamal keypair from it: the public key is published when you register so senders can encrypt to you, and the scalar derived from EK is your viewing key. Anyone holding the viewing key can decrypt your credit memos and open your balance ciphertexts, but spending also requires SK, so a viewing key is read-only by construction.',
  },
  register: {
    title: 'Register',
    short:
      'Publishes your encryption public key on chain and sets your balance to an encryption of zero. Required before anyone can mint or send to you.',
    long:
      'register() derives your encryption public key from EK and stores it under your Account ID. Registration is a prerequisite for sending or receiving: the module refuses credits to unregistered accounts. It is permissionless and paid by your wallet. The wrapper in this template does not gate it; a composing contract could (for example on a KYC list).',
  },
  spendable: {
    title: 'Spendable balance',
    short:
      'Your confirmed balance, stored on chain as an ElGamal ciphertext only your viewing key can read. Sends and burns draw from it.',
    long:
      'The module keeps two balances per account. _balances is the SPENDABLE (confirmed) balance that debits draw from. It is stored as an exponential-ElGamal ciphertext (g^value), so the chain never sees the number. Your browser knows the plaintext because it either constructed the ciphertext (your own sends) or learned the amount from a memo (credits), and caches it; the "source" shown next to the balance says how it was learned.',
  },
  pending: {
    title: 'Pending balance',
    short:
      'Incoming credits land here first. Sweep moves them into your spendable balance. Reconstructed exactly from your memos.',
    long:
      '_pending is the incoming pool that credits land in. Only the owner moves pending into spendable, via sweep(). This dual-balance split stops a third party from churning your spendable ciphertext with dust credits, which would otherwise invalidate your in-flight spend proofs. Pending only ever changes by credits (each leaves a memo) or by a reset to zero on sweep, so its plaintext is always the sum of your newest memos and can be recovered exactly.',
  },
  memos: {
    title: 'Credits received',
    short:
      'Every mint or transfer to you leaves an encrypted memo carrying the exact amount; your viewing key decrypts it directly. Newest first.',
    long:
      'Each credit pushes an ECDH one-time-pad memo to the recipient\'s per-account memo list. The recipient\'s wallet decrypts each entry directly with its encryption secret (no discrete-log search), which is how it learns incoming amounts of any size. Memos record credits only: sends, approvals and burns move value with no memo, so summing memos overcounts an account that has ever spent. Only the account owner can clear the list.',
  },
  sweep: {
    title: 'Sweep',
    short: 'Moves everything in pending into spendable in one proof. Do this before spending what you received.',
    long:
      'sweep() is the only path from pending into spendable and only the owner can call it: the proof shows both the account secret (identifies the account) and the encryption secret (proves the caller can read it). It is purely homomorphic: it adds the two ciphertexts and resets pending to an encryption of zero. No plaintext is needed because the wallet already learned the pending amounts from its memos.',
  },
  send: {
    title: 'Send (confidential transfer)',
    short: 'Debits you, credits the recipient and pushes them a memo. The amount is hidden; the sender and recipient Account IDs are public.',
    long:
      'transfer(to, value) proves you hold at least value in your spendable balance, debits it, credits the recipient\'s pending pool and pushes an encrypted memo. Requirements: you are registered with enough spendable balance, the recipient is registered, and it is not yourself. The counterparty graph (sender, recipient) is public on every transfer; amounts are not.',
  },
  issue: {
    title: 'Issue (mint)',
    short:
      'Issuer only. Credits a registered account and raises the public total supply by the same amount, so the minted amount is visible as a supply delta.',
    long:
      'mint(account, value) in this template is gated by Ownable: only the issuer Account ID fixed at deployment may call it. It credits the account\'s pending pool (the recipient must have registered first) and adds value to the PublicSupply extension\'s totalSupply. Because totalSupply is public, every mint and burn discloses its amount; balances and transfers stay hidden.',
  },
  burn: {
    title: 'Burn',
    short: 'Destroys tokens from your own spendable balance and lowers the public total supply.',
    long:
      'burn(value) debits your spendable balance (the proof shows the balance really encrypts at least value) and subtracts value from totalSupply. Like mint, the amount is disclosed through the supply delta.',
  },
  totalSupply: {
    title: 'Total supply',
    short: 'Public, tracked by the PublicSupply extension. Each mint and burn reveals its amount as a supply delta.',
    long:
      'The base ConfidentialFungibleToken module discloses no amounts and tracks no supply. This template pairs it with ConfidentialFungibleTokenPublicSupply, which keeps a public circulating supply and updates it on mint and burn. A confidential-supply layer would hide these too.',
  },
  issuer: {
    title: 'Issuer',
    short: 'The Account ID set as the Ownable owner at deployment: the only account allowed to issue (mint).',
    long:
      'The deployer passes their Account ID to the constructor, which initialises Ownable with it. The issuer authenticates with the same secret as its CFT account, so whoever deployed from this browser is the issuer from this browser. Ownership can be transferred by exporting more Ownable circuits in the wrapper.',
  },
  registeredAccounts: {
    title: 'Registered accounts',
    short: 'Account IDs that have published an encryption key. The IDs are public ledger keys; their balances are not.',
    long:
      'The _encryptionKeys map holds one ElGamal public key per registered Account ID. Anyone can list its keys, which is how the Issue form offers registered recipients. Balances, pending pools and memos for those accounts remain encrypted.',
  },
  contractAddress: {
    title: 'Contract address',
    short: 'Where this token lives on chain. Share it so others can join the same token.',
    long:
      'Each deployment is a separate contract with its own address, state and issuer. Joining means reading that contract\'s public state through the indexer and attaching your Account ID to it; nothing is written until you register.',
  },
  balanceSource: {
    title: 'Balance source',
    short: 'How this browser learned the plaintext: cache, memos, an expected value after your own move (verified), bounded search, or unknown.',
    long:
      'cache: a plaintext this browser stored earlier. memos: the sum of decrypted credit memos, verified against the ciphertext. candidate: the value this browser expected after its own sweep or send, verified against the ciphertext. recovered: found by a bounded discrete-log search over the decrypted point. unknown: none of the above worked; enter the balance you know and it will be verified before use.',
  },
  network: {
    title: 'Network',
    short: 'The Midnight network your 1AM wallet is on. The app follows the wallet; switch networks inside 1AM.',
    long:
      'preview and preprod are public test networks, undeployed is the local Docker devnet, mainnet is production. The app has no network selector: on connect it reads the network the wallet reports and reconnects on it, and it follows the wallet if you switch networks there. Tokens, accounts and this browser\'s token list all exist per network.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryId = keyof typeof GLOSSARY;
export const GLOSSARY_ORDER: GlossaryId[] = [
  'accountId',
  'viewingKey',
  'register',
  'spendable',
  'pending',
  'memos',
  'sweep',
  'send',
  'issue',
  'burn',
  'totalSupply',
  'issuer',
  'registeredAccounts',
  'contractAddress',
  'balanceSource',
  'network',
];
