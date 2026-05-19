# Passcode & Key Management

Trezur uses a three-layer key hierarchy. The user's passcode (or device identity) protects a master key, which encrypts all token data.

## Key Hierarchy

```
User Passcode (or device clientId if no passcode)
    │
    ▼ PBKDF2 (600,000 iterations, SHA-256, random 16-byte salt)
Local Wrapping Key (LWK, AES-256-GCM)
    │
    ├── wrap/unwrap ──► Master Secret Key (MSK, 32 random bytes)
    │                        │
    │                        ▼ importRawKey
    │                   Payload CryptoKey (AES-256-GCM)
    │                        │
    │                        ├── encrypts LocalKVVault (localStorage)
    │                        └── encrypts CloudFileVault (Google Drive)
    │
    └── MSK is convertible to a 24-word BIP39 mnemonic for recovery
```

The MSK is generated once and never changes through passcode changes. Changing the passcode only re-wraps the MSK with a new LWK — tokens stay encrypted with the same payload key.

### localStorage Keys

| Key                    | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `T_ES_KDF_META`        | KDF parameters: `{ v, name, salt, iterations, hash }`     |
| `T_ES_WRAPPED_MSK`     | MSK wrapped with LWK: `{ iv, data }`                      |
| `T_ES_WRAPPED_MSK_BAK` | Backup of wrapped MSK during passcode change (temporary)  |
| `T_conditions`         | `{ clientId, isUserPasscodeSet }` — plaintext, persistent |

## Cold Start

On first page load, `+layout.js` runs client-side:

1. Loads `settings` and `conditions` from localStorage.
2. Generates a `clientId` (nanoid) if none exists — this is both a device identifier and the fallback encryption passkey when no user passcode is set.
3. Passes everything to `+layout.svelte`.

`+layout.svelte` then evaluates:

**No passcode set, storage not yet initialized:**

```js
if (!isUserPasscodeSet && clientId && !isStorageAvailable()) {
	initStorage(clientId);
}
```

Uses the `clientId` as the passkey. Generates a fresh MSK, wraps it with a LWK derived from the clientId, creates the local vault, and loads tokens.

**Passcode set, storage not yet initialized:**

```js
if (isUserPasscodeSet && !isStorageAvailable() && !isAppLocked) {
	clearStorage();
	conditionsContext.updateCondition('isAppLocked', true);
}
```

Locks the app. The `UnlockScreen` renders, waiting for the user to enter their passcode.

## Unlock Flow

```
User long-presses lock icon
  → PasscodeDialog opens (verify mode)
  → User enters passcode
  → keyManager.testPasskey(passcode)  // read-only check, no state change
  → OK → handleUnlock(passcode)
       → initStorage(passcode)
         → keyManager.unlock(passcode)
           → derives LWK from passcode + stored KDF metadata
           → unwraps MSK with LWK
           → imports MSK as AES-GCM CryptoKey
         → creates LocalKVVault(cryptoKey)
         → tokensContext.iMake(localVault)  // load tokens from vault
         → cloudSyncService.init()          // restore sync state
       → conditionsContext.updateCondition('isAppLocked', false)
  → App renders main content with tokens
```

`keyManager.testPasskey()` reads the stored wrapped MSK and KDF metadata, attempts to derive the LWK and unwrap, and returns true/false without modifying any state. This is the passcode validation step before full initialization.

## Lock Flow

Triggered by long-press on the lock icon in FooterNav:

```js
clearStorage();
conditionsContext.updateCondition('isAppLocked', true);
```

`clearStorage()` calls `keyManager.lock()` (clears `#cryptoKey` and `#passcode` from memory), nulls the vault reference, and resets the tokens context. **Persistent data is untouched** — all encrypted data remains in localStorage, just no longer readable without re-deriving the payload key.

## KeyManager

`KeyManager` (`src/lib/state/key-manager.svelte.js`) is a singleton. It holds the in-memory `#cryptoKey` (payload key) and `#passcode` as **private** fields — external code cannot read them.

### unlock(passkey)

Three branches depending on what's stored:

**Branch A — Normal (wrapped MSK + KDF metadata exist):**

- Reads `T_ES_WRAPPED_MSK` and `T_ES_KDF_META`.
- If metadata version < 1 (legacy v0): force-upgrades KDF parameters, re-wraps MSK with new salt/iterations.
- Derives LWK from passkey + metadata, unwraps MSK, imports as CryptoKey.
- Returns the CryptoKey.

**Branch B — Legacy migration (no wrapped MSK, but vault data exists):**

- Detected by presence of old `T_ES_*` localStorage keys.
- Derives salt from passkey using legacy method, creates v0 metadata.
- Sets `#needsMigration = true` — on next `initStorage`, tokens will be re-encrypted under the new MSK architecture.
- Returns the LWK directly as CryptoKey (MSK doesn't exist yet).

**Branch C — Fresh start (nothing stored):**

- Generates random 16-byte salt, KDF metadata (v1, PBKDF2, 600K iter, SHA-256).
- Derives LWK, generates new 32-byte MSK, wraps it with LWK.
- Stores metadata + wrapped MSK.
- Imports MSK as CryptoKey and returns it.

### testPasskey(passkey)

Read-only check: derives LWK from passkey + stored metadata, attempts to unwrap MSK. Returns boolean. Does not modify state or import the crypto key.

### changePasscode(newPass)

1. Unwraps MSK with current LWK.
2. Backs up current wrapped MSK to `T_ES_WRAPPED_MSK_BAK` (safety net).
3. Generates new salt, new KDF metadata.
4. Derives new LWK from new passcode.
5. Re-wraps MSK with new LWK, stores it.
6. Deletes backup.

This is also used to "remove" a passcode — `changePasscode(clientId)` re-wraps the MSK from the user passcode to the device clientId. The MSK and all tokens remain intact.

### lock()

Clears `#cryptoKey` and `#passcode` from memory. Does not touch persistent storage.

### purge()

Clears in-memory state and removes `T_ES_KDF_META`, `T_ES_WRAPPED_MSK`, `T_ES_WRAPPED_MSK_BAK` from localStorage.

## Storage Orchestration

`storage.svelte.js` coordinates vault lifecycle. It holds two module-level `$state` values: `localVault` and `cryptoKey`.

### initStorage(passkeyParam)

```js
initStorage(passkeyParam)
  → keyManager.unlock(passkeyParam) → CryptoKey
  → create LocalKVVault(cryptoKey)
  → tokensContext.iMake(localVault)  // load tokens from vault
  → cloudSyncService.init()          // restore sync state + auto-sync
  → return true (or false if unlock failed)
```

### clearStorage()

Memory-only cleanup:

- `cloudSyncService.stopAutoSync()`
- `tokensContext.resetTokens()` — clears in-memory tokens
- `localVault = null`, `cryptoKey = null`
- `keyManager.lock()` — clears in-memory key material

Used for locking the app. Persisted data is untouched.

### purgeStorage()

Full wipe:

- `cloudSyncService.stopAutoSync()`
- `tokensContext.purgeTokens()` — deletes from vault + clears memory
- `localVault.clear()` — removes all `T_ES_*` localStorage items
- `localVault = null`, `cryptoKey = null`
- `keyManager.purge()` — clears memory + removes stored MSK/metadata

Used for "Forgot Passcode" and "Delete All Data".

### adoptMSK(newMSK)

Called during cloud recovery. Calls `keyManager.adoptMSK(newMSK)` which re-wraps the new MSK with the current passcode, re-derives the crypto key, creates a fresh LocalKVVault, and re-initializes tokens + cloud sync.

### rotateMSK()

Generates a fresh MSK and calls `adoptMSK`. Used during cloud onboarding to ensure the backup key is strong and unique.

## Setting, Changing, or Removing a Passcode

All three operations use `keyManager.changePasscode()` — the only difference is what passkey is passed:

| Operation       | Passed to changePasscode | What happens                                             |
| --------------- | ------------------------ | -------------------------------------------------------- |
| Set passcode    | User's new passcode      | MSK re-wrapped from clientId-LWK to passcode-LWK         |
| Change passcode | User's new passcode      | MSK re-wrapped from old passcode-LWK to new passcode-LWK |
| Remove passcode | `conditions.clientId`    | MSK re-wrapped from passcode-LWK to clientId-LWK         |

In all cases, the MSK is unwrapped with the current LWK and re-wrapped with the new one. Tokens are never re-encrypted. After the operation, `isUserPasscodeSet` is updated and the app re-locks if the passcode was removed.

## Forgot Passcode

1. User taps "Forgot passcode?" in PasscodeDialog.
2. Confirms by typing "YES".
3. `purgeStorage()` — wipes all encrypted data and key material.
4. `isAppLocked = false`, `isUserPasscodeSet = false`.
5. `initStorage(clientId)` — generates a fresh MSK, creates empty vault.
6. Navigates to `/`.

All previous tokens are lost. Recovery is only possible via cloud mnemonic backup.

## Conditions State Machine

| Transition                  | Trigger                               | What Changes                                        |
| --------------------------- | ------------------------------------- | --------------------------------------------------- |
| First launch                | `+layout.js` generates clientId       | `clientId` set                                      |
| Cold start (no passcode)    | Layout cold-start init                | Vault created, tokens loaded                        |
| Set passcode                | Settings → create passcode            | `isUserPasscodeSet = true`                          |
| Remove passcode             | Settings → remove passcode            | `isUserPasscodeSet = false`                         |
| Page reload (with passcode) | Auto-lock `$effect`                   | `isAppLocked = true`                                |
| Unlock (with passcode)      | PasscodeDialog → verify → initStorage | `isAppLocked = false`                               |
| Unlock (no passcode)        | FooterNav long-press                  | `isAppLocked = false` after `initStorage(clientId)` |
| Lock                        | FooterNav long-press or settings      | `isAppLocked = true`                                |
| Forgot passcode             | purgeStorage + re-init                | `isAppLocked = false`, `isUserPasscodeSet = false`  |
| Delete all data             | Settings → purge all                  | All conditions reset, page reloads                  |

`isAppLocked` is intentionally not persisted — it's re-derived from `isUserPasscodeSet` + storage availability on every page load.

## Source Files

| File                                                | Role                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/state/key-manager.svelte.js`               | KeyManager singleton: unlock, lock, changePasscode, testPasskey, purge |
| `src/lib/state/storage.svelte.js`                   | Vault orchestration: initStorage, clearStorage, purgeStorage, adoptMSK |
| `src/lib/state/conditions.svelte.js`                | Conditions context: isAppLocked, isUserPasscodeSet, clientId           |
| `src/lib/state/passcode.svelte.js`                  | Runtime passcode state (session memory, not persisted)                 |
| `src/lib/utils/crypto-keys.js`                      | deriveLWK, generateMSK, wrapMSK, unwrapMSK, importPayloadKey           |
| `src/lib/utils/local-kv-vault.js`                   | LocalKVVault: AES-GCM encrypted localStorage adapter                   |
| `src/routes/+layout.svelte`                         | Cold-start init, auto-lock effect, lock/unlock entry points            |
| `src/lib/components/passcode/UnlockScreen.svelte`   | Unlock UI, passcode verify, forgot passcode flow                       |
| `src/lib/components/passcode/PasscodeDialog.svelte` | Passcode input dialog (create/verify/change modes)                     |
| `src/lib/components/nav/FooterNav.svelte`           | Lock icon, triggers lock/unlock via layout callback                    |
