## Refactored Encrypted Storage Architecture – Implementation Spec

### Objective

Replace the overly‑layered storage modules with **three concrete components** and **zero redundant interfaces**. Eliminate the raw MSK from all code except the key manager. Remove the separate session passcode store and centralize unlock state.

---

## 1. New Components

### 1.1 `KeyManager` (singleton in `$lib/state/key-manager.svelte.js`)

- **Owns** the wrapped MSK and KDF metadata in persistent storage (`localStorage` keys: `T_ES_KDF_META`, `T_ES_WRAPPED_MSK`, `T_ES_WRAPPED_MSK_BAK`).
- **Holds in memory** (private, never exposed directly):
  - `#cryptoKey: CryptoKey | null`
  - `#passcode: string | null`
- **Public API:**
  - `unlock(passkey: string): Promise<CryptoKey | null>` – derives LWK, unwraps stored MSK (or generates + wraps new one), imports payload key, stores `#cryptoKey` & `#passcode`. Returns the `CryptoKey` or `null` on failure.
  - `get cryptoKey(): CryptoKey | null` – current in‑memory key.
  - `get hasWrappedKey(): boolean` – `true` if a wrapped MSK exists (indicating a passcode was ever set). Useful for UX without keeping the passcode.
  - `lock(): void` – nulls `#cryptoKey` and `#passcode`. Call on app lock / logout.
  - `testPasskey(passkey: string): Promise<boolean>` – attempts to unwrap the stored MSK _without_ modifying `#cryptoKey` or `#passcode`.
  - `changePasscode(newPass: string): Promise<void>` – rewraps the MSK under `newPass` using the stored `#passcode` as the old passcode. Requires app to be unlocked. Throws if `#passcode` is null.
  - `replaceMSK(newMSK: Uint8Array, passkey: string): Promise<void>` – wraps a new MSK, updates `localStorage`, imports it as `#cryptoKey`. `passkey` must be explicitly provided (this is a destructive, rare operation, e.g., cloud backup adoption). If you need to replace the MSK while unlocked but don’t want to re‑prompt, you can pass `this.#passcode` internally — the public signature just allows forcing.
- **Implementation notes:**
  - On first unlock with a passcode, `T_ES_KDF_META` is created with a random salt (v1). No legacy salt derivation needed (assume all users are on v1).
  - If `T_ES_WRAPPED_MSK_BAK` exists and primary is missing, recover from backup before proceeding (atomic rewrap safety).
  - On `lock()`, do **not** delete the wrapped MSK from storage; just nullify in‑memory state.

### 1.2 `LocalKVVault` (new in `$lib/utils/local-kv-vault.js`)

- **Encrypted key‑value store, backed by `localStorage` directly.**
- **Constructor:** `new LocalKVVault(cryptoKey: CryptoKey)`
- **Public API:** `get(key: string): Promise<any>`, `set(key: string, value: any): Promise<void>`, `delete(key: string): Promise<void>`, `purge(): Promise<void>`.
- **Internal details:**
  - Data stored under `T_ES_` + key (key is not further encoded; simple concatenation).
  - Uses AES‑GCM, 12‑byte random IV per write, IV + ciphertext stored as `{ iv: number[], data: number[] }` JSON.
  - `purge()` deletes all `T_ES_*` entries **and** the wrapped MSK & KDF metadata (i.e., complete wipe of app data). Caller must first ensure they want this.
  - No knowledge of passcodes, MSK, or key derivation.

### 1.3 `CloudFileVault` (new in `$lib/utils/cloud-file-vault.js`)

- **Stateless encrypted file packer/unpacker for cloud sync.**
- **Constructor:** `new CloudFileVault(cryptoKey: CryptoKey)`
- **Public API:**
  - `pack(payload: object): Promise<Uint8Array>` – encrypts JSON payload, returns a versioned file buffer (1‑byte version + 12‑byte IV + ciphertext).
  - `unpack(buffer: Uint8Array): Promise<object>` – verifies version byte, decrypts, returns parsed payload. Throws on mismatch or decryption failure (useful for mnemonic verification).
- **Internal:** uses `importPayloadKey` already inside? No – it receives a `CryptoKey` directly; no further key handling.
- **Dependencies:** `importPayloadKey` from `crypto-keys.js` (only if we choose to allow importing raw MSK – we don’t; `CloudFileVault` always gets a `CryptoKey` from outside).

---

## 2. Deleted Modules

Remove the following files / exports completely:

- `$lib/state/storage.svelte.js` (the `EncryptedLocalStorage` class and `encryptedLocalStorage` instance).
- `$lib/utils/encrypted-storage.js` (contains `AESGCMEncryptedStorage`, `LocalStorageEngine`, and the `EncryptedStorage`/`AsyncStorageEngine` interfaces).
- `$lib/state/passcode.svelte.js` (the `sessionPasscode` store) – superseded by `KeyManager`.
- `$lib/state/migration.svelte.js` – its logic is now split between `KeyManager.changePasscode`/`replaceMSK` and a thin orchestrator where needed (e.g., in `init.js` or backup service).

---

## 3. Adapted Modules

### 3.1 `$lib/state/init.js`

Replace the current orchestration with:

```js
import { keyManager } from '$lib/state/key-manager.svelte';
import { LocalKVVault } from '$lib/utils/local-kv-vault';
import { tokensContext } from '$lib/state/tokens.svelte';

export async function initStorageAndTokens(passkey) {
	try {
		const cryptoKey = await keyManager.unlock(passkey);
		if (!cryptoKey) return false;

		const localVault = new LocalKVVault(cryptoKey);
		await tokensContext.iMake(localVault);
		return true;
	} catch (err) {
		console.error('[init] Failed to initialize:', err);
		return false;
	}
}
```

**No other modules call `encryptedLocalStorage.init` or `sessionPasscode` again.**

### 3.2 Tokens Context (`$lib/state/tokens.svelte.js`)

- The context already expects an object with `get`/`set`/`delete`/`purge`. No signature change required. Just ensure it uses whatever is passed via `iMake`.

### 3.3 Backup Service (`$lib/sync/backup.svelte.js`)

- **Remove** methods: `_getMSK`, `_encryptPayload`, `_decryptPayload`.
- **Remove imports** of `assembleCloudFile`, `parseCloudFile`, and any direct `crypto.subtle` calls.
- **Sync method:**
  1. Check `if (!keyManager.cryptoKey) return;` (app is locked).
  2. `const vault = new CloudFileVault(keyManager.cryptoKey);`
  3. Download cloud blob → `const cloudPayload = await vault.unpack(buffer);` (if file exists).
  4. Merge local tokens (obtained via `tokensContext.current`) with cloud payload.
  5. `const mergedPayload = { … };`
  6. `const fileBytes = await vault.pack(mergedPayload);`
  7. Upload fileBytes.
- **Mnemonic verification** (for cloud backup recovery):
  - Derive a temporary key: `const tempKey = await importPayloadKey(mnemonicToMSK(words));` (you may keep a small helper for this).
  - `const vault = new CloudFileVault(tempKey);`
  - `await vault.unpack(cloudBuffer);` → success means valid phrase.
- **Adopt cloud backup:**
  - `const newMsk = mnemonicToMSK(words);`
  - Clear tokens: `tokensContext.resetTokens()`.
  - `await localVault.purge();` (clear all encrypted data; `localVault` must be accessible – store a reference globally after init, or call via `keyManager`).
  - `await keyManager.replaceMSK(newMsk, currentPasscode);` (passcode is in memory – you can call `keyManager.changePasscode` later? No, `replaceMSK` expects the passkey explicitly, but you can create a version that uses stored passcode if unlocked; alternatively, just call `replaceMSK(newMsk, keyManager.#passcode)` from within the service, but that breaks encapsulation. Better: expose a method `adoptMSK(newMSK)` that uses stored passcode.)
    - **Add to KeyManager:** `adoptMSK(newMSK: Uint8Array): Promise<void>` – wraps new MSK using `#passcode`, updates `#cryptoKey`. Throws if locked. This keeps passcode inside KeyManager.
  - Reinitialize local vault and tokens context:
    ```js
    const localVault = new LocalKVVault(keyManager.cryptoKey);
    await tokensContext.iMake(localVault);
    // optionally sync back from cloud
    ```
- **Auto‑sync:** use `keyManager.cryptoKey` check.
- **Remove** all dependencies on `sessionPasscode`; use `keyManager.cryptoKey` instead.
- **Settings** like `lastSyncTime` can be stored in encrypted local storage via the `localVault` (which you can expose as a global after init, e.g., `export const localStore = …`).

### 3.4 Passcode Change UI Flow

- Call `await keyManager.changePasscode(newPass);` – no re‑prompt needed.
- LocalKVVault instances remain valid because the CryptoKey hasn’t changed.

### 3.5 Lock / Unlock Flow

- **Unlock:** gather passcode → `await keyManager.unlock(passcode)` → if successful, run `initStorageAndTokens` (which now expects just passkey, but will be called once the key is already in memory? Actually `initStorageAndTokens` currently calls `keyManager.unlock` again. Let's adjust: after a successful `keyManager.unlock`, we can directly create the local vault and init tokens, or simplify `initStorageAndTokens` to work with the already‑unlocked state. Better: separate `initStorageAndTokens` into two steps: 1) unlock, 2) create vaults and init tokens. The code responsible for unlocking calls `keyManager.unlock` and then, on success, calls a new `setupLocalVault()` that creates the vault and hooks tokens. I'll include this in spec.)
- **Lock:** call `keyManager.lock()` and **explicitly null the local vault reference** (e.g., `localVault = null`) and clear tokens UI state. You may keep the tokens context but ensure it cannot perform encrypted operations until re‑initialized.

---

## 4. Global State Management

- Export a **single** `KeyManager` instance from `key-manager.svelte.js` as `export const keyManager = new KeyManager();`.
- After `initStorageAndTokens`, store the created `LocalKVVault` instance in a global variable (e.g., `export let localVault = null;` in `init.js` or a dedicated `$lib/state/local-vault.svelte.js`). This allows the backup service and any other code to access encrypted settings without re‑deriving the key. When locking, set it to `null`.

```js
// in init.js (updated)
let localVault = null;

export async function unlockAndInit(passcode) {
	const cryptoKey = await keyManager.unlock(passcode);
	if (!cryptoKey) return false;
	localVault = new LocalKVVault(cryptoKey);
	await tokensContext.iMake(localVault);
	return true;
}

export function getLocalVault() {
	return localVault;
} // or a simple getter

export function lockApp() {
	keyManager.lock();
	localVault = null;
	// also clear tokens UI state
}
```

- The backup service can access `localVault` through `getLocalVault()` for settings storage.

---

## 5. Migration & Legacy Support

- If you still need to migrate users from very old KDF (legacy salt), `KeyManager.unlock` can detect the format (e.g., `metadata.v < 1`) and internally re‑encrypt the wrapped MSK with new metadata, then mark `#needsMigration` flag. Since we’re removing `needsMigration` from public API, this is fine. No other module cares.

- Ensure that the encryption keys for local data (`T_ES_` prefix) remain unchanged — no data loss.

---

## 6. Acceptance Criteria

1. App cold‑start → unlock → tokens accessible.
2. Passcode change without re‑prompting → storage still works.
3. App lock → local vault reference nulled → backup sync refuses to run (no key).
4. Cloud sync works using `CloudFileVault`, without any `crypto.subtle` calls in backup service.
5. Mnemonic verification and cloud backup adoption work.
6. `sessionPasscode`, `EncryptedLocalStorage`, `AESGCMEncryptedStorage`, `LocalStorageEngine`, and related interfaces are entirely removed.
7. No raw MSK or passcode passed to vaults or orchestrators.
8. All existing tests (if any) pass after adapting imports.

---

## 7. File Overview (New & Changed)

| File                               | Status                                      |
| ---------------------------------- | ------------------------------------------- |
| `$lib/state/key-manager.svelte.js` | New                                         |
| `$lib/utils/local-kv-vault.js`     | New                                         |
| `$lib/utils/cloud-file-vault.js`   | New                                         |
| `$lib/state/init.js`               | Rewritten                                   |
| `$lib/sync/backup.svelte.js`       | Heavily modifed (remove crypto, use vaults) |
| `$lib/state/tokens.svelte.js`      | No changes (if interface matches)           |
| `$lib/state/passcode.svelte.js`    | **Delete**                                  |
| `$lib/state/storage.svelte.js`     | **Delete**                                  |
| `$lib/utils/encrypted-storage.js`  | **Delete**                                  |
| `$lib/state/migration.svelte.js`   | **Delete** (logic absorbed)                 |

Everything else (crypto‑keys, drive client, etc.) remains unchanged.
