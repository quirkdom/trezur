# Storage and Key Manager Refactor Specification

## Overview

This spec defines two related refactors:

1. **Remove public `cryptoKey` getter from `keyManager`** — storage caches the cryptoKey, vault creation is routed through storage, and callers no longer access the key directly.
2. **Secure `adoptMSK` flow** — `storage.adoptMSK()` orchestrates key mutations without exposing the user's passcode via a public getter on `keyManager`.

---

## Current State

### KeyManager (`key-manager.svelte.js`)

- Holds `#passcode` (user's passcode, private)
- Holds `#cryptoKey` (imported from MSK, private)
- `cryptoKey` getter is **public** — any importer can access the raw CryptoKey
- `passcode` getter was added recently (public)
- `adoptMSK(newMSK)` is public — any importer can call it
- `unlock(passkey)` returns the cryptoKey and sets internal state

### Storage (`storage.svelte.js`)

- `initStorage(passkey)` — calls `keyManager.unlock(passkey)`, creates `LocalKVVault`, assigns to module-level `localVault`
- `getLocalVault()` — returns the module-level `localVault`
- `clearStorage()` — clears keyManager lock and resets state
- **Does not** hold or cache the cryptoKey
- **Does not** have `adoptMSK` — callers go directly to `keyManager.adoptMSK()`

### Backup (`backup.svelte.js`)

- Calls `keyManager.adoptMSK()` directly (line 248)
- Calls `new CloudFileVault(keyManager.cryptoKey)` directly (line 90)
- Imports and uses `keyManager` directly

### Layout and Settings Pages

- Guards like `if (!keyManager.cryptoKey)` are used as presence checks for "app is unlocked"

---

## Desired State

### Design Principles

1. **`keyManager` is the sole source of truth for key material** — passcode and MSK live here, cryptoKey is derived here.
2. **Raw cryptoKey is never returned via a public getter** — vault classes need the CryptoKey to construct, but they receive it through factory methods, not raw access.
3. **`storage` is the only external interface for vault creation and MSK mutations** — all callers go through storage.
4. **`keyManager` has no knowledge of vault classes** — vault creation is an outer-layer concern.
5. **User passcode is never exposed** — it stays inside `keyManager` throughout.

---

## Plan A: Remove `cryptoKey` Getter and Route Vault Creation Through Storage

### Step 1: Add vault factory methods to `storage`

**File:** `src/lib/state/storage.svelte.js`

- Add private field `#cryptoKey` (nullable)
- Add private field `#passkey` — stored after `initStorage(passkey)`
- Modify `initStorage(passkey)` to also cache the returned cryptoKey in `#cryptoKey`
- Add `createCloudVault()` — returns `new CloudFileVault(this.#cryptoKey)`
- Add `adoptMSK(newMSK)`:
  ```js
  await keyManager.adoptMSK(newMSK);
  // Re-derive cryptoKey by re-unlocking with stored passkey
  const cryptoKey = await keyManager.unlock(this.#passkey);
  this.#cryptoKey = cryptoKey;
  ```
  This avoids needing a passcode getter — `storage` already holds the passkey it received during init.
- Add `getCloudVault()` — alias for `createCloudVault()`

### Step 2: Remove `cryptoKey` getter from `keyManager`

**File:** `src/lib/state/key-manager.svelte.js`

- Remove `get cryptoKey()` — no longer public
- All existing usages of `keyManager.cryptoKey` must be updated to use vault factories via storage instead

### Step 3: Update `backup.svelte.js`

**File:** `src/lib/sync/backup.svelte.js`

- Remove `keyManager` import (no longer needed)
- In `sync()`: replace `new CloudFileVault(keyManager.cryptoKey)` with `new CloudFileVault(storage.getCloudVault().#cryptoKey)` — but CloudFileVault takes a CryptoKey in its constructor, not a vault. Instead, replace with `storage.createCloudVault()` which returns a fully constructed CloudFileVault instance
- In `adoptCloudBackup()`: replace `initStorage(keyManager.passcode)` with `storage.adoptMSK(newMsk)` — storage handles the full adoption flow including re-init

### Step 4: Update guard checks

**Files:** `src/routes/+layout.svelte`, `src/routes/settings/+page.svelte`

- Replace `!keyManager.cryptoKey` guards with `!getLocalVault()` — if the local vault exists, the app is unlocked

### Step 5: Update `storage.initStorage` to cache passkey

**File:** `src/lib/state/storage.svelte.js`

- Store the passkey in a private field `#passkey` (encrypted or just held in memory — it is already in memory in keyManager, so this is no worse)
- After `keyManager.unlock(passkey)`, cache the returned cryptoKey in `#cryptoKey`

---

## Plan B: Secure `adoptMSK` Without Exposing `passcode` Getter

### Constraint

`storage.adoptMSK` needs the passkey to re-derive the cryptoKey after `keyManager.adoptMSK()` changes the MSK. The passkey is available to `storage` because it is called with `initStorage(passkey)` first. So **storage must store the passkey during init** and use it to re-derive the key.

### Implementation

**File:** `src/lib/state/storage.svelte.js`

During `initStorage(passkey)`:

```js
this.#passkey = passkey;
const cryptoKey = await keyManager.unlock(passkey);
this.#cryptoKey = cryptoKey;
```

During `adoptMSK(newMSK)`:

```js
await keyManager.adoptMSK(newMSK);
// Re-derive using stored passkey — no getter needed
const cryptoKey = await keyManager.unlock(this.#passkey);
this.#cryptoKey = cryptoKey;
```

This means `keyManager.passcode` getter is **not needed** — `storage` holds the passkey it was initialized with. No other module ever needs the passcode.

### Cleanup

If `passcode` getter was added to `keyManager` (as a temporary fix for the earlier bug), it should be **removed** after this refactor is complete. The passcode lives only in `keyManager`'s private field and `storage`'s private field.

---

## Combined Implementation Order

### Phase 1: Storage owns vault creation and cryptoKey caching

1. Update `storage.svelte.js`:
   - Add `#passkey` and `#cryptoKey` private fields
   - Update `initStorage` to cache both passkey and cryptoKey
   - Add `createCloudVault()` function
   - Add `adoptMSK(newMSK)` function (uses stored passkey to re-derive cryptoKey)
2. Update `backup.svelte.js`:
   - Replace `new CloudFileVault(keyManager.cryptoKey)` with `storage.createCloudVault()`
   - Replace `initStorage(keyManager.passcode)` with `storage.adoptMSK(newMsk)`
   - Remove `keyManager` import
3. Update guards in `+layout.svelte` and `settings/+page.svelte` to use `!getLocalVault()` instead of `!keyManager.cryptoKey`

### Phase 2: Remove cryptoKey and passcode getters from keyManager

4. Remove `get cryptoKey()` from `keyManager` — all callers now use storage's vault factories
5. Remove `get passcode()` from `keyManager` — storage holds the passkey it was initialized with; no other module needs it

### Phase 3: Verify and test

6. Run `npm run check` and `npm run lint` to ensure no type or lint errors
7. Test flow: cold start, unlock, enable cloud backup, sync, adopt cloud backup, change passcode, lock/unlock

---

## Files to Modify

| File                                  | Changes                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/state/storage.svelte.js`     | Add passkey/cryptoKey caching, `createCloudVault()`, `adoptMSK()` |
| `src/lib/state/key-manager.svelte.js` | Remove `cryptoKey` getter, remove `passcode` getter               |
| `src/lib/sync/backup.svelte.js`       | Route vault creation through storage, remove keyManager import    |
| `src/routes/+layout.svelte`           | Update guards to use `getLocalVault()`                            |
| `src/routes/settings/+page.svelte`    | Update guards to use `getLocalVault()`                            |

---

## Verification Checklist

- [ ] `npm run check` passes with no new errors
- [ ] `npm run lint` passes with no new errors
- [ ] Cold start with no passcode works
- [ ] Unlock with passcode works
- [ ] Enable cloud backup triggers adopt flow correctly
- [ ] Sync reads/writes cloud file using new vault
- [ ] Adopt cloud backup (recovery flow) works
- [ ] Lock/unlock cycle works
- [ ] Change passcode works
- [ ] No direct access to `keyManager.cryptoKey` or `keyManager.passcode` anywhere in codebase
