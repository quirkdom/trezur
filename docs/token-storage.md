# Token Storage

Trezur stores 2FA tokens in AES-256-GCM encrypted localStorage. All token data is encrypted at rest with a key derived from the Master Secret Key (MSK).

## Token Data Model

```ts
interface Token {
	id: string; // unique identifier (nanoid)
	account: string; // account name (e.g. "user@example.com")
	secret: string; // Base32-encoded TOTP/HOTP secret
	issuer: string; // service provider name
	algorithm: string; // "SHA1", "SHA256", "SHA512"
	digits: number; // code length (typically 6 or 8)
	period: number; // TOTP period in seconds (typically 30)
	type: string; // "TOTP" or "HOTP"
	counter: number; // HOTP counter (0 for TOTP tokens)
	updatedAt: {
		account: number; // timestamp when account name last changed
		issuer: number; // timestamp when issuer last changed
		secret: number; // timestamp when secret last changed
		params: number; // timestamp when period/digits/algorithm/type/counter last changed
	};
}
```

The `updatedAt` timestamps enable field-level LWW conflict resolution during cloud sync. Each field group tracks its own modification time independently — updating an account name doesn't affect the secret's timestamp.

## LocalKVVault

`LocalKVVault` (`src/lib/utils/local-kv-vault.js`) provides AES-256-GCM encrypted key-value storage on top of localStorage.

### Storage Format

Each value is encrypted separately:

```
localStorage key: T_ES_<obfuscated_name>
localStorage value: { iv: number[], data: number[] }
```

- `iv`: 12-byte AES-GCM nonce (as array of numbers for JSON serialization)
- `data`: AES-GCM ciphertext + 16-byte auth tag

The vault holds multiple entries:

- `T_ES_tokens` — the serialized tokens and tombstones JSON
- `T_ES_backup_state` — cloud sync metadata (autoSyncEnabled, lastSyncTime, lastError)

### API

```js
vault.get(key); // decrypts and returns value (or null)
vault.set(key, value); // encrypts and stores value
vault.delete(key); // removes from localStorage
vault.clear(); // removes all T_ES_* keys
```

Encryption happens at write time, decryption at read time. The vault holds a reference to the payload CryptoKey but never exposes it.

## TokensCtx

`TokensCtx` (`src/lib/state/tokens.svelte.js`) is the reactive token store. It's accessed via the singleton `tokensContext`.

### Initialization (iMake)

```js
tokensContext.iMake(storage)
  → creates new TokensCtx(localVault)
    → loads tokens + tombstones from vault
    → deduplicates by id:secret key
    → persists to vault
    → initialises reactive $state
```

If a previous context exists (e.g. during vault rotation), existing in-memory tokens are merged into the new storage before the old context is replaced.

### CRUD Operations

**addToken / addTokens:**

- Deduplicates by `id:secret` composite key (same id+secret = same token, skip)
- Stamps all `updatedAt` fields with `Date.now()`
- Persists to vault immediately

**updateToken(token):**

- Stamps only the fields that actually changed with `Date.now()`
- Unchanged fields keep their existing timestamps
- Persists to vault immediately

**removeToken(id):**

- Creates a tombstone: `{ [id]: Date.now() }`
- Removes the token from the active list
- Persists to vault immediately

**setTokensAndTombstones({ tokens, tombstones }):**

- Atomic replace — used by the cloud sync engine after merge
- Sets `skipSyncNotify = true` to prevent the sync from scheduling itself recursively
- Validates and deduplicates incoming tokens
- Persists to vault immediately

### Tombstones

When a token is deleted, it's not simply removed — a tombstone is recorded:

```json
{
	"<deleted_token_id>": 1710883200000
}
```

Tombstones are checked during:

- **Load:** Tokens whose max `updatedAt` timestamp ≤ their tombstone timestamp are pruned.
- **Sync merge:** A tombstone with a higher timestamp than a token's fields means the delete wins — the token is removed rather than merged.

This prevents a stale backup from resurrecting a deleted token.

## Encryption at Rest

All token data in localStorage is encrypted:

- **No plaintext token data** — secrets, account names, issuers, all encrypted
- **AES-256-GCM** — authenticated encryption, detects tampering
- **Payload key** derived from MSK via PBKDF2 → LWK → unwrap MSK → import as CryptoKey
- **Separate IV per entry** — each `T_ES_*` value gets a fresh random 12-byte nonce
- **Key material** (MSK, LWK) never stored in plaintext — only the KDF metadata and wrapped MSK

## Source Files

| File                                  | Role                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| `src/lib/utils/local-kv-vault.js`     | LocalKVVault: encrypted localStorage adapter                 |
| `src/lib/state/tokens.svelte.js`      | TokensCtx + singleton context, CRUD, LWW merge helpers       |
| `src/lib/utils/crypto-keys.js`        | deriveLWK, generateMSK, wrapMSK, unwrapMSK, importPayloadKey |
| `src/lib/state/storage.svelte.js`     | Vault lifecycle: initStorage, clearStorage, purgeStorage     |
| `src/lib/state/key-manager.svelte.js` | KeyManager: passkey → LWK → MSK → CryptoKey                  |
| `src/lib/types.ts`                    | Token, Tokenable, Tombstone, SyncState type definitions      |
